const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const fs = require('fs');
const marked = require('marked');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const minimatch = require('minimatch');
const exphbs = require('express-handlebars');
const markdown = require('marked');
const Handlebars = require('handlebars');
const crypto = require('crypto');
var config = require('../config');


const secret = crypto.randomBytes(64).toString('hex');
const app = express();

const filePath = path.join(__dirname, '../../../node_modules');
var filePrefix = '';

const authJsonPath = path.join(__dirname, filePrefix + '../mock', 'auth.json');
const authJson = JSON.parse(fs.readFileSync(authJsonPath, 'utf-8'));

const orgDetailsPath = path.join(__dirname, filePrefix + '../mock', 'orgDetails.json');
const orgDetails = JSON.parse(fs.readFileSync(orgDetailsPath, 'utf-8'));

const hbs = exphbs.create({});

if (fs.existsSync(filePath)) {
    filePrefix = '../../../src/';
}
app.engine('.hbs', engine({
    extname: '.hbs'
}));
app.set('view engine', 'hbs');
app.use(express.static(path.join(__dirname, filePrefix + '../public')));
app.use('/images', express.static(path.join(__dirname, 'images')));


app.use(session({
    secret: secret,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Configure the OpenID Connect strategy
if (authJson.clientID) {
    passport.use(new OAuth2Strategy({
        issuer: authJson.issuer,
        authorizationURL: authJson.authorizationURL,
        tokenURL: authJson.tokenURL,
        userInfoURL: authJson.userInfoURL,
        clientID: authJson.clientID,
        callbackURL: authJson.callbackURL,
        scope: authJson.scope,
    }, (accessToken, refreshToken, profile, done) => {
        // Here you can handle the user's profile and tokens
        return done(null, profile);
    }));
}
const copyStyelSheet = () => {

    if (!fs.existsSync(path.join(__dirname, filePrefix + 'styles'))) {
        fs.mkdirSync(path.join(__dirname, filePrefix + 'styles'));

    }
    var styleDir = [];
    searchFile(path.join(__dirname, 'partials'), ".css", styleDir);
    searchFile(path.join(__dirname, 'layout'), ".css", styleDir);
    searchFile(path.join(__dirname, 'pages'), ".css", styleDir);
}

function searchFile(dir, fileName, styleDir) {
    // read the contents of the directory
    fs.readdir(dir, (err, files) => {
        if (err) throw err;

        // search through the files
        for (const file of files) {
            // build the full path of the file
            const filePath = path.join(dir, file);

            // get the file stats
            fs.stat(filePath, (err, fileStat) => {
                if (err) throw err;

                // if the file is a directory, recursively search the directory
                if (fileStat.isDirectory()) {
                    searchFile(filePath, fileName, styleDir);
                } else if (file.endsWith(fileName)) {
                    // if the file is a match, print it
                    if (!fs.existsSync(path.join(__dirname, filePrefix + 'styles/' + path.basename(filePath)))) {
                        fs.copyFile(filePath, path.join(__dirname, filePrefix + 'styles/' + path.basename(filePath)),
                            fs.constants.COPYFILE_EXCL, (err) => {
                                if (err) {
                                    console.log("Error Found:", err);
                                }
                            });
                    }
                }
            });
        }
    });

    return styleDir;
}

copyStyelSheet();
app.use('/styles', express.static(path.join(__dirname, filePrefix + '/styles')));
const folderToDelete = path.join(__dirname, filePrefix + '/styles');

process.on('SIGINT', () => {
    if (fs.existsSync(folderToDelete)) {
        fs.rmSync(folderToDelete, { recursive: true, force: true });
    }
    process.exit();
});

process.on('exit', () => {
    if (fs.existsSync(folderToDelete)) {
        fs.rmSync(folderToDelete, { recursive: true, force: true });
    }
});

// Initialize Passport
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

// Function to load and convert markdown file to HTML
const loadMarkdown = (filename, dirName) => {
    const filePath = path.join(__dirname, dirName, filename);
    if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return marked.parse(fileContent);
    } else {
        return null;
    }
};

const registerPartials = (dir) => {
    const filenames = fs.readdirSync(dir);
    filenames.forEach((filename) => {
        const matches = /^([^.]+).hbs$/.exec(filename);
        if (!matches) {
            return;
        }
        const name = matches[1];
        if (!name.endsWith('.css')) {
            const template = fs.readFileSync(path.join(dir, filename), 'utf8');
            hbs.handlebars.registerPartial(name, template);
        }
    });
};

const renderTemplate = (templateName, layoutName, templateContent) => {

    const templatePath = path.join(__dirname, filePrefix + templateName);
    const templateResponse = fs.readFileSync(templatePath, 'utf-8')

    const layoutPath = path.join(__dirname, filePrefix + layoutName);
    const layoutResponse = fs.readFileSync(layoutPath, 'utf-8')

    const template = Handlebars.compile(templateResponse.toString());
    const layout = Handlebars.compile(layoutResponse.toString());

    const html = layout({
        body: template(templateContent)
    });
    return html;
}

// Route to start the authentication process
app.get('/((?!favicon.ico)):orgName/login', async (req, res, next) => {
    const authJsonResponse = await fetch(config.adminAPI + "identityProvider?orgName=" + req.params.orgName);
    var authJsonContent = await authJsonResponse.json();
    console.log(authJsonContent);

    if (authJsonContent.length > 0) {
        passport.use(new OAuth2Strategy({
            issuer: authJsonContent[0].issuer,
            authorizationURL: authJsonContent[0].authorizationURL,
            tokenURL: authJsonContent[0].tokenURL,
            userInfoURL: authJsonContent[0].userInfoURL,
            clientID: authJsonContent[0].clientId,
            callbackURL: authJsonContent[0].callbackURL,
            scope: authJsonContent[0].scope ? authJsonContent[0].scope.split(" ") : "",
        }, (accessToken, refreshToken, profile, done) => {
            // Here you can handle the user's profile and tokens
            return done(null, profile);
        }));
        next();
    } else {
        res.status(400).send("No Identity Provider information found for the organization");
    }
}, passport.authenticate('oauth2'));

// Route for the callback
app.get('/((?!favicon.ico)):orgName/callback', (req, res, next) => {
    next();
}, passport.authenticate('oauth2', {
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


    if ((req.originalUrl != '/favicon.ico' | req.originalUrl != '/images') && orgDetails.authenticatedPages != null
        && orgDetails.authenticatedPages.some(pattern => minimatch.minimatch(req.originalUrl, pattern))) {
        if (req.isAuthenticated()) {
            return next();
        } else {
            req.session.returnTo = req.originalUrl || '/' + req.params.orgName;
            res.redirect("/" + req.params.orgName + '/login');
        }
    } else {
        return next();
    };

};
// Home Route
app.get('/((?!favicon.ico)):orgName', ensureAuthenticated, (req, res) => {

    const mockProfileDataPath = path.join(__dirname, filePrefix + '../mock', '/userProfiles.json');
    const mockProfileData = JSON.parse(fs.readFileSync(mockProfileDataPath, 'utf-8'));

    registerPartials(path.join(__dirname, filePrefix, 'pages', 'home', 'partials'));
    registerPartials(path.join(__dirname, filePrefix, 'partials'));

    var templateContent = {
        baseUrl:  req.params.orgName
    };
    const html = renderTemplate('pages/home/page.hbs', 'layout/main.hbs', templateContent)
    res.send(html);
});

// API Route
app.get('/((?!favicon.ico)):orgName/api/:apiName', ensureAuthenticated, async(req, res) => {

    const orgName = req.params.orgName;
    const apiName = req.params.apiName;
    const apiMetaDataUrl = config.apiMetaDataAPI + "api?orgName=" + orgName + "&apiID=" + apiName;
    const metadataResponse = await fetch(apiMetaDataUrl);
    const metaData = await metadataResponse.json();

     //replace image urls
     const images = metaData.apiInfo.apiArtifacts.apiImages;

     for (var key in images) {
         var apiImageUrl = '';
         if (config.env == 'local') {
             apiImageUrl = config.apiImageURL + "apiFiles?orgName=" + orgName + "&apiID=" + apiName;
         } else {
             apiImageUrl = config.apiMetaDataAPI + "apiFiles?orgName=" + orgName + "&apiID=" + apiName;
         }
         const modifiedApiImageURL = apiImageUrl + "&fileName=" + images[key]
         images[key] = modifiedApiImageURL;
     }

    registerPartials(path.join(__dirname, filePrefix, 'pages', 'api-landing', 'partials'));
    registerPartials(path.join(__dirname, filePrefix, 'partials'));
    
    const apiContetnUrl = config.apiMetaDataAPI + "apiFiles?orgName=" + orgName + "&apiID=" + apiName;

    const markdownResponse = await fetch(apiContetnUrl + "&fileName=content.md");
    const markdownContent = await markdownResponse.text();
    const markdownHtml = markdownContent ? markdown.parse(markdownContent) : '';

    var templateContent = {
        content: markdownHtml,
        apiMetadata: metaData,
        baseUrl: '/' + req.params.orgName,
    }

    const html = renderTemplate('pages/api-landing/page.hbs', 'layout/main.hbs', templateContent)
    res.send(html);
});

// APIs Route
app.get('/((?!favicon.ico)):orgName/apis', ensureAuthenticated, async(req, res) => {


    const orgName = req.params.orgName;
    const apiMetaDataUrl = config.apiMetaDataAPI + "apiList?orgName=" + orgName;

    registerPartials(path.join(__dirname, filePrefix, 'pages', 'apis', 'partials'));
    registerPartials(path.join(__dirname, filePrefix, 'partials'));

    const metadataResponse = await fetch(apiMetaDataUrl);
    const metaData = await metadataResponse.json();

    metaData.forEach(item => {
        item.baseUrl = '/' + req.params.orgName;
    });

    metaData.forEach(element => {
        const images = element.apiInfo.apiArtifacts.apiImages;
        var apiImageUrl = '';
        for (var key in images) {
            if (config.env == 'local') {
                apiImageUrl = config.apiImageURL + "apiFiles?orgName=" + orgName + "&apiID=" + element.apiInfo.apiName;
            } else {
                apiImageUrl = config.apiMetaDataAPI + "apiFiles?orgName=" + orgName + "&apiID=" + element.apiInfo.apiName;
            }
            const modifiedApiImageURL = apiImageUrl + "&fileName=" + images[key]
            element.apiInfo.apiArtifacts.apiImages[key] = modifiedApiImageURL;
        }
    });

    var templateContent = {
        apiMetadata: metaData,
        baseUrl: req.params.orgName
    }
    const html = renderTemplate('pages/apis/page.hbs', 'layout/main.hbs', templateContent);
    res.send(html);
});

// Tryout Route
app.get('/((?!favicon.ico)):orgName/api/:apiName/tryout', ensureAuthenticated, async(req, res) => {

    const apiMetaDataUrl = config.apiMetaDataAPI + "apiDefinition?orgName=" + req.params.orgName + "&apiID=" + req.params.apiName;
    const metadataResponse = await fetch(apiMetaDataUrl);
    const metaData = await metadataResponse.text();

    registerPartials(path.join(__dirname, filePrefix, 'partials'));

    var templateContent = {
        apiMetadata: metaData,
        baseUrl: req.params.orgName
    }
    const html = renderTemplate('pages/tryout/page.hbs', 'layout/main.hbs', templateContent);
    res.send(html);
});

// Wildcard Route for other pages
app.get('/((?!favicon.ico|images):orgName/*)', ensureAuthenticated, (req, res) => {

    const filePath = req.originalUrl.split("/").pop();

    //read all files in partials folder
    registerPartials(path.join(__dirname, filePrefix, 'partials'));
    if (fs.existsSync(path.join(__dirname, filePrefix + 'pages', filePath, 'partials'))) {
        registerPartials(path.join(__dirname, filePrefix + 'pages', filePath, 'partials'));
    }

    var templateContent = {};
    //templateContent["authJson"] = authJson;
    templateContent["baseUrl"] = '/' + req.params.orgName;

    //read all markdown content
    if (fs.existsSync(path.join(__dirname, filePrefix + 'pages', filePath, 'content'))) {
        const markdDownFiles = fs.readdirSync(path.join(__dirname, 'pages/' + filePath + '/content'));
        markdDownFiles.forEach((filename) => {
            const tempKey = filename.split('.md')[0];
            templateContent[tempKey] = loadMarkdown(filename, 'pages/' + filePath + '/content')
        });
    }

    const html = renderTemplate('pages/' + filePath + '/page.hbs', 'layout/main.hbs', templateContent)
    res.send(html);

});

app.listen(3000);