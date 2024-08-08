const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const fs = require('fs');
const marked = require('marked');
const session = require('express-session');
const passport = require('passport');
const OpenIDConnectStrategy = require('passport-openidconnect').Strategy;
const minimatch = require('minimatch');
const exphbs = require('express-handlebars');
const Handlebars = require('handlebars');


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
// app.set('views', [
//     path.join(__dirname, filePrefix + 'pages/layouts'),

//     // path.join(__dirname, filePrefix + 'pages/apiLandingPage'),
//     // path.join(__dirname, filePrefix + 'pages/apis'),
//     path.join(__dirname, filePrefix + 'pages/home'),
//     path.join(__dirname, filePrefix + 'partials')
// ]);

app.use(express.static(path.join(__dirname, filePrefix + '../public')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));


app.use(session({
    secret: authJson.clientSecret ? authJson.clientSecret : ' ',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));


// Configure the OpenID Connect strategy
if (authJson.clientSecret) {
    passport.use(new OpenIDConnectStrategy({
        issuer: authJson.issuer,
        authorizationURL: authJson.authorizationURL,
        tokenURL: authJson.tokenURL,
        userInfoURL: authJson.userInfoURL,
        clientID: authJson.clientID,
        clientSecret: authJson.clientSecret,
        callbackURL: authJson.callbackURL,
        scope: authJson.scope,
    }, (issuer, sub, profile, accessToken, refreshToken, done) => {
        // Here you can handle the user's profile and tokens
        return done(null, profile);
    }));
}

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
    const filePath = path.join(__dirname, filePrefix + dirName, filename);
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
        const template = fs.readFileSync(path.join(dir, filename), 'utf8');
        hbs.handlebars.registerPartial(name, template);
    });
};

// Route to start the authentication process

app.get('/login', (req, res, next) => {
    if (authJson.clientSecret) {
        next();
    } else {
        res.redirect('/');
    }

}, passport.authenticate('openidconnect'));

// Route for the callback
app.get('/callback', (req, res, next) => {
    next();
}, passport.authenticate('openidconnect', {
    failureRedirect: '/login',
    keepSessionInfo: true
}), (req, res) => {
    // Retrieve the original URL from the session
    const returnTo = req.session.returnTo || '/';
    // Clear the returnTo variable from the session
    delete req.session.returnTo;
    res.redirect(returnTo);
});

// Middleware to check authentication
const ensureAuthenticated = (req, res, next) => {
    if (req.originalUrl != '/favicon.ico' && orgDetails.authenticatedPages.some(pattern => minimatch.minimatch(req.originalUrl, pattern))) {
        if (req.isAuthenticated()) {
            return next();
        } else {
            req.session.returnTo = req.originalUrl || '/';
            res.redirect('/login');
        }
    } else {
        return next();
    };
};
// Home Route
app.get('/', ensureAuthenticated, (req, res) => {

    const mockProfileDataPath = path.join(__dirname, filePrefix + '../mock', '/userProfiles.json');
    const mockProfileData = JSON.parse(fs.readFileSync(mockProfileDataPath, 'utf-8'));

    registerPartials(path.join(__dirname, 'pages', 'home', 'partials'));
    registerPartials(path.join(__dirname, 'partials'));

    var filePath = path.join(__dirname, filePrefix + 'pages/home/home.hbs');
    const templateResponse = fs.readFileSync(filePath, 'utf-8')

    filePath = path.join(__dirname, filePrefix + 'layouts/main.hbs');
    const layoutResponse = fs.readFileSync(filePath, 'utf-8')


    const template = Handlebars.compile(templateResponse.toString());
    const layout = Handlebars.compile(layoutResponse.toString());
    const html = layout({
        body: template({
            userProfiles: mockProfileData,
            authJson: authJson,
            baseUrl: "http://localhost:3000",
        })
    });

    res.send(html);
});

// API Route
app.get('/api/:apiName', ensureAuthenticated, (req, res) => {

    const mockAPIDataPath = path.join(__dirname, filePrefix + '../mock', req.params.apiName + '/apiMetadata.json');
    const mockAPIData = JSON.parse(fs.readFileSync(mockAPIDataPath, 'utf-8'));
    const filePath = path.join(__dirname, filePrefix + '../mock', req.params.apiName + '/apiContent.hbs');

    if (fs.existsSync(filePath)) {
        hbs.handlebars
        hbs.handlebars.registerPartial('apiContent', fs.readFileSync(filePath, 'utf-8'));
    }
    registerPartials(path.join(__dirname, 'pages', 'apiLandingPage', 'partials'));
    registerPartials(path.join(__dirname, 'partials'));

    const templatePath = path.join(__dirname, filePrefix + 'pages/apiLandingPage/apiDetailTemplate.hbs');
    const templateResponse = fs.readFileSync(templatePath, 'utf-8')

    const layoutPath = path.join(__dirname, filePrefix + 'layouts/main.hbs');
    const layoutResponse = fs.readFileSync(layoutPath, 'utf-8')


    const template = Handlebars.compile(templateResponse.toString());
    const layout = Handlebars.compile(layoutResponse.toString());

    const html = layout({
        body: template({
            content: loadMarkdown('content.md', filePrefix + '../mock/' + req.params.apiName),
            apiMetadata: mockAPIData,
            authJson: authJson,
            baseUrl: "http://localhost:3000",
        })
    });

    res.send(html);
});

// APIs Route
app.get('/apis', ensureAuthenticated, (req, res) => {

    const mockAPIMetaDataPath = path.join(__dirname, filePrefix + '../mock', 'apiMetadata.json');
    const mockAPIMetaData = JSON.parse(fs.readFileSync(mockAPIMetaDataPath, 'utf-8'));

    registerPartials(path.join(__dirname, 'pages', 'apis', 'partials'));
    registerPartials(path.join(__dirname, 'partials'));

    const templatePath = path.join(__dirname, filePrefix + 'pages/apis/apis.hbs');
    const templateResponse = fs.readFileSync(templatePath, 'utf-8')

    const layoutPath = path.join(__dirname, filePrefix + 'layouts/main.hbs');
    const layoutResponse = fs.readFileSync(layoutPath, 'utf-8')
    const template = Handlebars.compile(templateResponse.toString());
    const layout = Handlebars.compile(layoutResponse.toString());

    const html = layout({
        body: template({
            apiMetadata: mockAPIMetaData,
            authJson: authJson,
            baseUrl: "http://localhost:3000",
        })
    });
    res.send(html);
});

// Tryout Route
app.get('/api/:apiName/tryout', ensureAuthenticated, (req, res) => {

    const mockAPIDataPath = path.join(__dirname, filePrefix + '../mock', req.params.apiName + '/apiMetadata.json');
    const mockAPIData = JSON.parse(fs.readFileSync(mockAPIDataPath, 'utf-8')).apiInfo.openApiDefinition;

    registerPartials(path.join(__dirname, 'partials'));

    const templatePath = path.join(__dirname, filePrefix + 'pages/tryout/tryout.hbs');
    const templateResponse = fs.readFileSync(templatePath, 'utf-8')

    const layoutPath = path.join(__dirname, filePrefix + 'layouts/main.hbs');
    const layoutResponse = fs.readFileSync(layoutPath, 'utf-8')
    const template = Handlebars.compile(templateResponse.toString());
    const layout = Handlebars.compile(layoutResponse.toString());

    const html = layout({
        body: template({
            apiMetadata: JSON.stringify(mockAPIData),
            authJson: authJson,
            baseUrl: "http://localhost:3000"
        })
    });
    res.send(html);
});

// Wildcard Route for other pages
app.get('*', ensureAuthenticated, (req, res) => {

    res.render(req.params[0].substring(1), {
        content: loadMarkdown(req.params[0].split("/").pop() + ".md", 'content'),
        authJson: authJson,
        baseUrl: "http://localhost:3000",
    });

});

app.listen(3000);