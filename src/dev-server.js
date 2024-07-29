const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const fs = require('fs');
const marked = require('marked');
const session = require('express-session');
const passport = require('passport');
const OpenIDConnectStrategy = require('passport-openidconnect').Strategy;
const minimatch = require('minimatch');

const app = express();

const filePath = path.join(__dirname, '../../../node_modules');
var filePrefix = '';

const authJsonPath = path.join(__dirname, filePrefix + '../mock', 'auth.json');
const authJson = JSON.parse(fs.readFileSync(authJsonPath, 'utf-8'));

const orgDetailsPath = path.join(__dirname, filePrefix + '../mock', 'orgDetails.json');
const orgDetails = JSON.parse(fs.readFileSync(orgDetailsPath, 'utf-8'));

if (fs.existsSync(filePath)) {
    filePrefix = '../../../src/';
}
app.engine('.hbs', engine({
    extname: '.hbs'
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, filePrefix + 'views'));

app.use(express.static(path.join(__dirname, filePrefix + '../public')));


app.use(session({
    secret: authJson.clientSecret ? authJson.clientSecret : ' ',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));


// Configure the OpenID Connect strategy
if (orgDetails.authenticatedPages.length > 0) {
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

// Route to start the authentication process
app.get('/login', (req, res, next) => {
    next();
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


// API Route
app.get('/api/:apiName', ensureAuthenticated, (req, res) => {

    const mockAPIDataPath = path.join(__dirname, filePrefix + '../mock', req.params.apiName + '/apiMetadata.json');
    const mockAPIData = JSON.parse(fs.readFileSync(mockAPIDataPath, 'utf-8'));

    res.render('apiTemplate', {
        apiMetadata: mockAPIData,
        content: loadMarkdown('apiContent.md', '../mock/' + req.params.apiName)
    });

});

// APIs Route
app.get('/apis', ensureAuthenticated, (req, res) => {

    const mockAPIMetaDataPath = path.join(__dirname, filePrefix + '../mock', 'apiMetadata.json');
    const mockAPIMetaData = JSON.parse(fs.readFileSync(mockAPIMetaDataPath, 'utf-8'));

    res.render('apis', {
        apiMetadata: mockAPIMetaData
    });

});

// Home Route
app.get('/', ensureAuthenticated, (req, res) => {
    res.render('home', {
        heroContent: loadMarkdown('hero.md', 'content')
    });
});

// Tryout Route
app.get('/api/:apiName/tryout', ensureAuthenticated, (req, res) => {

    const mockAPIDataPath = path.join(__dirname, filePrefix + '../mock', req.params.apiName + '/apiMetadata.json');
    const mockAPIData = JSON.parse(fs.readFileSync(mockAPIDataPath, 'utf-8')).apiInfo.openApiDefinition;

    res.render('tryout', {
        apiMetadata: JSON.stringify(mockAPIData)
    });

});

// Wildcard Route for other pages
app.get('*', ensureAuthenticated, (req, res) => {

    res.render(req.params[0].substring(1), {
        content: loadMarkdown(req.params[0].split("/").pop() + ".md", 'content')
    });

});

app.listen(3000);