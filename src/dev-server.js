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
const Handlebars = require('handlebars');

const crypto = require('crypto');

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

    if (!fs.existsSync(path.join(__dirname, 'styles'))) {
        fs.mkdirSync(path.join(__dirname, 'styles'));

    }
    var styleDir = [];
    searchFile(path.join(__dirname, 'partials'), ".css", styleDir);
    searchFile(path.join(__dirname, 'layouts'), ".css", styleDir);
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
app.use('/styles', express.static(path.join(__dirname, 'styles')));
const folderToDelete = path.join(__dirname, 'styles');

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

app.get('/login', (req, res, next) => {
    if (authJson.clientID) {
        next();
    } else {
        res.redirect('/');
    }

}, passport.authenticate('oauth2'));

// Route for the callback
app.get('/callback', (req, res, next) => {
    next();
}, passport.authenticate('oauth2', {
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

    var templateContent = {
        userProfiles: mockProfileData,
        authJson: authJson,
        baseUrl: "http://localhost:3000",
    };
    const html = renderTemplate('pages/home/page.hbs', 'layouts/main.hbs', templateContent)
    res.send(html);
});

// API Route
app.get('/api/:apiName', ensureAuthenticated, (req, res) => {

    const mockAPIDataPath = path.join(__dirname, filePrefix + '../mock', req.params.apiName + '/apiMetadata.json');
    const mockAPIData = JSON.parse(fs.readFileSync(mockAPIDataPath, 'utf-8'));
    const filePath = path.join(__dirname, filePrefix + '../mock', req.params.apiName + '/apiContent.hbs');

    if (fs.existsSync(filePath)) {
        hbs.handlebars.registerPartial('apiContent', fs.readFileSync(filePath, 'utf-8'));
    }
    registerPartials(path.join(__dirname, 'pages', 'apiLandingPage', 'partials'));
    registerPartials(path.join(__dirname, 'partials'));

    var templateContent = {
        content: loadMarkdown('content.md', filePrefix + '../mock/' + req.params.apiName),
        apiMetadata: mockAPIData,
        authJson: authJson,
        baseUrl: "http://localhost:3000",
    }

    const html = renderTemplate('pages/apiLandingPage/page.hbs', 'layouts/main.hbs', templateContent)
    res.send(html);
});

// APIs Route
app.get('/apis', ensureAuthenticated, (req, res) => {

    const mockAPIMetaDataPath = path.join(__dirname, filePrefix + '../mock', 'apiMetadata.json');
    const mockAPIMetaData = JSON.parse(fs.readFileSync(mockAPIMetaDataPath, 'utf-8'));

    registerPartials(path.join(__dirname, 'pages', 'apis', 'partials'));
    registerPartials(path.join(__dirname, 'partials'));

    var templateContent = {
        apiMetadata: mockAPIMetaData,
        authJson: authJson,
        baseUrl: "http://localhost:3000",
    }
    const html = renderTemplate('pages/apis/page.hbs', 'layouts/main.hbs', templateContent);
    res.send(html);
});

// Tryout Route
app.get('/api/:apiName/tryout', ensureAuthenticated, (req, res) => {

    const mockAPIDataPath = path.join(__dirname, filePrefix + '../mock', req.params.apiName + '/apiMetadata.json');
    const mockAPIData = JSON.parse(fs.readFileSync(mockAPIDataPath, 'utf-8')).apiInfo.openApiDefinition;

    registerPartials(path.join(__dirname, 'partials'));

    var templateContent = {
        apiMetadata: JSON.stringify(mockAPIData),
        authJson: authJson,
        baseUrl: "http://localhost:3000"
    }
    const html = renderTemplate('pages/tryout/page.hbs', 'layouts/main.hbs', templateContent);
    res.send(html);
});

// Wildcard Route for other pages
app.get('/((?!styles)/*)', ensureAuthenticated, (req, res) => {

    const filePath = req.originalUrl.split("/").pop();

    //read all files in partials folder
    registerPartials(path.join(__dirname, filePrefix + 'pages', filePath, 'partials'));
    registerPartials(path.join(__dirname, 'partials'));

    //read all markdown content
    const markdDownFiles = fs.readdirSync(path.join(__dirname, 'pages/' + filePath + '/content'));
    var templateContent = {};

    templateContent["authJson"] = authJson;
    templateContent["baseUrl"] = "http://localhost:3000";

    markdDownFiles.forEach((filename) => {
        const tempKey = filename.split('.md')[0];
        templateContent[tempKey] = loadMarkdown(filename, 'pages/' + filePath + '/content')
    });

    const html = renderTemplate('pages/' + filePath + '/page.hbs', 'layouts/main.hbs', templateContent)
    res.send(html);

});

app.listen(3000);