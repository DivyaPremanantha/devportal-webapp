const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const hbs = require('hbs');
const fs = require('fs');
const markdown = require('markdown-it')();

const app = express();

app.engine('.hbs', engine({ extname: '.hbs' }));
app.use(express.static(path.join(__dirname, '../public')));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Function to load and convert markdown file to HTML
const loadMarkdown = (filename, dirName) => {
    const filePath = path.join(__dirname, dirName, filename);
    if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return markdown.render(fileContent);
    } else {
        return null;
    }
};

// Wildcard route to render any page based on the URL
app.get('*', (req, res) => {
    if (req.path.includes('/api/')) {
        const mockAPIDataPath = path.join(__dirname, '../mock', req.path.split('/').pop() + '/apiMetadata.json');
        const mockAPIData = JSON.parse(fs.readFileSync(mockAPIDataPath, 'utf-8'));

        res.render('apiTemplate', {
            apiMetadata: mockAPIData,
            content: loadMarkdown('apiContent.md', '../mock/' + req.path.split('/').pop())
        });
    } else if (req.path.includes('/apis')) {
        const mockAPIMetaDataPath = path.join(__dirname, '../mock', 'apiMetadata.json');
        const mockAPIMetaData = JSON.parse(fs.readFileSync(mockAPIMetaDataPath, 'utf-8'));
        
        res.render('apis', {
            apiMetadata: mockAPIMetaData
        });
    } else {
        res.render('home', {
            content: loadMarkdown('home.md', 'content')
        });
    }
});



app.listen(3000);