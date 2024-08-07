const express = require('express');
const path = require('path');
const exphbs = require('express-handlebars');
const markdown = require('marked');
const Handlebars = require('handlebars');
var config = require('../config');
const session = require('express-session');
const passport = require('passport');
const OpenIDConnectStrategy = require('passport-openidconnect').Strategy;
const minimatch = require('minimatch');

const app = express();

app.engine('hbs', exphbs.engine({ extname: '.hbs' }));
app.use(express.static(path.join(__dirname, '../public')));
const router = express.Router();

app.set('view engine', 'hbs');

app.set('views', path.join(__dirname, '/views'));

app.use(session({
    secret: '123',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

app.use(passport.initialize());
app.use(passport.session());
// Serialize user into the session
passport.serializeUser((user, done) => {
    done(null, user);
});

// Deserialize user from the session
passport.deserializeUser((user, done) => {
    done(null, user);
});

// Route to start the authentication process
app.get('/((?!favicon.ico)):orgName/login', async (req, res, next) => {
    const authJsonResponse = await fetch(config.adminAPI + "identityProvider?orgName=" + req.params.orgName);
    var authJsonContent = await authJsonResponse.json();

    if (authJsonContent[0].clientSecret !== "") {
        passport.use(new OpenIDConnectStrategy({
            issuer: authJsonContent[0].issuer,
            authorizationURL: authJsonContent[0].authorizationURL,
            tokenURL: authJsonContent[0].tokenURL,
            userInfoURL: authJsonContent[0].userInfoURL,
            clientID: authJsonContent[0].clientId,
            clientSecret: authJsonContent[0].clientSecret,
            callbackURL: authJsonContent[0].callbackURL,
            scope: authJsonContent[0].scope ? authJsonContent[0].scope.split(" ") : "",
        }, (issuer, sub, profile, accessToken, refreshToken, done) => {
            // Here you can handle the user's profile and tokens
            return done(null, profile);
        }));
    }

    next();
}, passport.authenticate('openidconnect'));

// Route for the callback
app.get('/((?!favicon.ico)):orgName/callback', (req, res, next) => {
    next();
}, passport.authenticate('openidconnect', {
    failureRedirect: '/login',
    keepSessionInfo: true
}), (req, res) => {
    const returnTo = req.session.returnTo || '/' + req.params.orgName;
    // Clear the returnTo variable from the session
    delete req.session.returnTo;
    res.redirect(returnTo);
});

// Middleware to check authentication
const ensureAuthenticated = async (req, res, next) => {

    const orgDetailsResponse = await fetch(config.adminAPI + "organisation?orgName=" + req.params.orgName);
    var orgDetails = await orgDetailsResponse.json();

    if (orgDetails.authenticatedPages) {
        if ((req.originalUrl != '/favicon.ico' | req.originalUrl != '/images') && orgDetails.authenticatedPages.some(pattern => minimatch.minimatch(req.originalUrl, pattern))) {
            console.log("Authenticated", req.isAuthenticated());
            if (req.isAuthenticated()) {
                return next();
            } else {
                req.session.returnTo = req.originalUrl || '/' + req.params.orgName;
                res.redirect("/" + req.params.orgName + '/login');
            }
        } else {
            return next();
        }
    } else {
        return next();
    };

};

// Middleware to load partials from the database
app.use(/\/((?!favicon.ico|images).*)/, async (req, res, next) => {

    const orgName = req.originalUrl.split("/")[1];
    const apiName = req.originalUrl.split("/").pop();
    const url = config.adminAPI + "orgFileType?orgName=" + orgName + "&fileType=partials";
    const apiContetnUrl = config.apiMetaDataAPI + "apiFiles?orgName=" + orgName + "&apiID=" + apiName;
    const imageUrl = config.adminAPI + "orgFiles?orgName=" + orgName;
    //attach partials
    const partialsResponse = await fetch(url);
    var partials = await partialsResponse.json();
    var partialObject = {}
    partials.forEach(file => {
        var fileName = file.pageName.split(".")[0];
        var content = file.pageContent;
        content = content.replaceAll("/images/", imageUrl + "&fileName=")
        partialObject[fileName] = content;
    });

    const markdownResponse = await fetch(apiContetnUrl + "&fileName=content.md");
    const markdownContent = await markdownResponse.text();
    const markdownHtml = markdownContent ? markdown.parse(markdownContent) : '';

    const additionalAPIContentResponse = await fetch(apiContetnUrl + "&fileName=apiContent.hbs");
    const additionalAPIContent = await additionalAPIContentResponse.text();
    partialObject["apiContent"] = additionalAPIContent;

    const hbs = exphbs.create({});
    hbs.handlebars.partials = partialObject;

    Object.keys(partialObject).forEach(partialName => {
        hbs.handlebars.registerPartial(partialName, partialObject[partialName]);
    });

    hbs.handlebars.partials = {
        ...hbs.handlebars.partials,
        header: hbs.handlebars.compile(partialObject['header'])({ baseUrl: '/' + req.originalUrl.split("/")[1] }),
        apiContent: hbs.handlebars.compile(partialObject['apiContent'])({ content: markdownHtml })
    };

    console.log(hbs.handlebars.partials.apiContent)

    next();
});

// Route to render Handlebars templates fetched from the database
router.get('/((?!favicon.ico)):orgName', ensureAuthenticated, async (req, res) => {
    const url = config.adminAPI + "orgFiles?orgName=" + req.params.orgName;
    try {
        const templateResponse = await fetch(url + "&fileName=home.hbs");
        var templateContent = await templateResponse.text();
        templateContent = templateContent.replace("/images/", url + "&fileName=");
        const layoutResponse = await fetch(url + "&fileName=main.hbs");
        var layoutContent = await layoutResponse.text();
        layoutContent = layoutContent.replaceAll("/styles/", url + "&fileName=");
        layoutContent = layoutContent.replaceAll("component/", "");

        const template = Handlebars.compile(templateContent.toString());
        const layout = Handlebars.compile(layoutContent.toString());
        const html = layout({
            body: template
        });
        res.send(html);
    } catch (err) {
        console.log(err);
    }
});

router.get('/((?!favicon.ico)):orgName/apis', ensureAuthenticated, async (req, res) => {

    const orgFilesUrl = config.adminAPI + "orgFiles?orgName=" + req.params.orgName;
    const apiMetaDataUrl = config.apiMetaDataAPI + "apiList?orgName=" + req.params.orgName;

    const templateResponse = await fetch(orgFilesUrl + "&fileName=apis.hbs");
    var templateContent = await templateResponse.text();

    const layoutResponse = await fetch(orgFilesUrl + "&fileName=main.hbs");
    var layoutContent = await layoutResponse.text();
    layoutContent = layoutContent.replaceAll("/styles/", orgFilesUrl + "&fileName=");
    layoutContent = layoutContent.replaceAll("component/", "");

    const metadataResponse = await fetch(apiMetaDataUrl);
    const metaData = await metadataResponse.json();

    metaData.forEach(element => {
        const apiImageUrl = config.apiMetaDataAPI + "apiFiles?orgName=" + element.apiInfo.orgName + "&apiID=" + element.apiInfo.apiName;
        const modifiedApiImageURL = apiImageUrl + "&fileName=" + element.apiInfo.apiArtifacts.apiImages['api-detail-page-image'];
        element.apiInfo.apiArtifacts.apiImages['api-detail-page-image'] = modifiedApiImageURL;
    });

    const template = Handlebars.compile(templateContent.toString());
    const layout = Handlebars.compile(layoutContent.toString());

    var html = layout({
        body: template({
            apiMetadata: metaData,
            baseUrl: req.params.orgName,
        }),
    });
    res.send(html);

});

router.get('/((?!favicon.ico)):orgName/api/:apiName', ensureAuthenticated, async (req, res) => {

    const orgFilesUrl = config.adminAPI + "orgFiles?orgName=" + req.params.orgName;
    const apiContetnUrl = config.apiMetaDataAPI + "apiFiles?orgName=" + req.params.orgName + "&apiID=" + req.params.apiName;
    const apiMetaDataUrl = config.apiMetaDataAPI + "api?orgName=" + req.params.orgName + "&apiID=" + req.params.apiName;

    const templateResponse = await fetch(orgFilesUrl + "&fileName=apiDetailTemplate.hbs");
    var templateContent = await templateResponse.text();

    const layoutResponse = await fetch(orgFilesUrl + "&fileName=main.hbs");
    var layoutContent = await layoutResponse.text();
    layoutContent = layoutContent.replaceAll("/styles/", orgFilesUrl + "&fileName=");
    layoutContent = layoutContent.replaceAll("component/", "");

    const metadataResponse = await fetch(apiMetaDataUrl);
    const metaData = await metadataResponse.json();

    //replace image urls
    const images = metaData.apiInfo.apiArtifacts.apiImages;

    for (var key in images) {
        const apiImageUrl = config.apiMetaDataAPI + "apiFiles?orgName=" + req.params.orgName + "&apiID=" + req.params.apiName;
        const modifiedApiImageURL = apiImageUrl + "&fileName=" + images[key]
        images[key] = modifiedApiImageURL;
    }
    const template = Handlebars.compile(templateContent.toString());
    const layout = Handlebars.compile(layoutContent.toString());

    var contentResponse = await fetch(apiContetnUrl + "&fileName=apiContent.hbs");
    contentResponse = await contentResponse.text();

    var html = layout({
        body: template({
            apiMetadata: metaData,
            baseUrl: '/' + req.params.orgName,
        }),
    });
    res.send(html);
});

router.get('/((?!favicon.ico)):orgName/api/:apiName/tryout', ensureAuthenticated, async (req, res) => {

    const apiMetaDataUrl = config.apiMetaDataAPI + "apiDefinition?orgName=" + req.params.orgName + "&apiID=" + req.params.apiName;
    const metadataResponse = await fetch(apiMetaDataUrl);
    const metaData = await metadataResponse.text();

    res.render('tryout', {
        apiMetadata: metaData,
        orgName: req.params.orgName,
    });

});

router.get('/((?!favicon.ico|images):orgName/*)', ensureAuthenticated, async (req, res) => {

    const orgName = req.params.orgName;
    const filePath = req.originalUrl.split(orgName)[1];
    const markdonwFile = req.params[0].split("/").pop() + ".md";
    const url = config.adminAPI + "orgFiles?orgName=" + orgName;
    const templateURL = config.adminAPI + "orgFileType?orgName=" + orgName + "&fileType=template&filePath=" + filePath;
    try {
        const templateResponse = await fetch(templateURL);
        var templateContent = await templateResponse.text();
        templateContent = templateContent.replace("/images/", url + "&fileName=");
        const layoutResponse = await fetch(url + "&fileName=main.hbs");
        var layoutContent = await layoutResponse.text();
        layoutContent = layoutContent.replaceAll("/styles/", url + "&fileName=");
        layoutContent = layoutContent.replaceAll("component/", "");
        const markdownResponse = await fetch(url + "&fileName=" + markdonwFile);
        const markdownContent = await markdownResponse.text();
        const template = Handlebars.compile(templateContent.toString());
        const layout = Handlebars.compile(layoutContent.toString());

        const html = layout({
            body: template(markdown.parse(markdownContent)),
        });
        res.send(html);
    } catch (err) {
        console.log(err);
    }

});



app.use('/', router);

app.listen(3000);