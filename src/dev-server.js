const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const fs = require('fs');
const markdown = require('markdown-it')();
const session = require('express-session');
const passport = require('passport');
const OpenIDConnectStrategy = require('passport-openidconnect').Strategy;

const app = express();

const filePath = path.join(__dirname, '../../../node_modules');
var filePrefix = '';

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
    secret: 'NrOy9PQEIEf3AftygGQU8TckGcbwJvT3cvWfd21jHDAa',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

const authJsonPath = path.join(__dirname, filePrefix + '../mock', 'auth.json');
const authJson = JSON.parse(fs.readFileSync(authJsonPath, 'utf-8'));

const orgDetailsPath = path.join(__dirname, filePrefix + '../mock', 'orgDetails.json');
const orgDetails = JSON.parse(fs.readFileSync(orgDetailsPath, 'utf-8'));
// Configure the OpenID Connect strategy
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
        return markdown.render(fileContent);
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
    failureRedirect: '/login'
}), (req, res) => {
    res.redirect('/');
});

// Wildcard route to render any page based on the URL
app.get('*', (req, res) => {

    if (req.isAuthenticated()) {
        if (req.path.includes('/api/') && req.params[0].split('/').length == 3) {
            const mockAPIDataPath = path.join(__dirname, filePrefix + '../mock', req.path.split('/').pop() + '/apiMetadata.json');
            const mockAPIData = JSON.parse(fs.readFileSync(mockAPIDataPath, 'utf-8'));

            res.render('apiTemplate', {
                apiMetadata: mockAPIData,
                content: loadMarkdown('apiContent.md', '../mock/' + req.path.split('/').pop())
            });
        } else if (req.path.includes('/apis')) {
            const mockAPIMetaDataPath = path.join(__dirname, filePrefix + '../mock', 'apiMetadata.json');
            const mockAPIMetaData = JSON.parse(fs.readFileSync(mockAPIMetaDataPath, 'utf-8'));

            res.render('apis', {
                apiMetadata: mockAPIMetaData
            });
        } else if (req.params[0] === "/") {
            res.render('home', {
                content: loadMarkdown('home.md', 'content')
            });
        } else if (req.path.includes('/tryout')) {
            const mockAPIDataPath = path.join(__dirname, filePrefix + '../mock', req.path.split('/')[2] + '/apiMetadata.json');
            const mockAPIData = JSON.parse(fs.readFileSync(mockAPIDataPath, 'utf-8')).apiInfo.openApiDefinition;

            res.render('tryout', {
                apiMetadata: JSON.stringify(mockAPIData)
            });
        } else {
            res.render(req.params[0].substring(1), {
                content: loadMarkdown(req.params[0].split("/").pop() + ".md", 'content')
            });
        }
    }
    else {
        res.redirect('/login');
    }
});

app.listen(3000);