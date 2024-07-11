const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const hbs = require('hbs');
const fs = require('fs');
const markdown = require('markdown-it')();

const app = express();

const filePath = path.join(__dirname, '../../../node_modules');
var filePrefix = '';

if (fs.existsSync(filePath)) {
    filePrefix = '../../../src/';
}

app.engine('.hbs', engine({
    extname: '.hbs',
    helpers: {
        fullUrl: (path) => {
            return `${app.locals.baseUrl}${path}`;
        }
    }
}));
app.use(express.static(path.join(__dirname, filePrefix + '../public')));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, filePrefix + 'views'));

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

// Wildcard route to render any page based on the URL
app.get('*', (req, res) => {
    if (req.path.includes('/api/') && req.params[0].split('/').length == 4) {
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
        const mockAPIDataPath = path.join(__dirname, filePrefix + '../mock', req.path.split('/')[3] + '/apiMetadata.json');
        const mockAPIData = JSON.parse(fs.readFileSync(mockAPIDataPath, 'utf-8')).apiInfo.openApiDefinition;

        res.render('tryout', {
            apiMetadata: JSON.stringify(mockAPIData)
        });
    } else {
        res.render(req.params[0].substring(1), {
            content: loadMarkdown(req.params[0].split("/").pop() + ".md", 'content')
        });
    }
});

app.listen(3000);