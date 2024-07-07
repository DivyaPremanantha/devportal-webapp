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
const loadMarkdown = (filename) => {
    const filePath = path.join(__dirname, 'content', filename);
    if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return markdown.render(fileContent);
    } else {
        return null;
    }
};

// Wildcard route to render any page based on the URL
app.get('*', (req, res) => {
    const requestedPath = req.path.split('/').pop();
    const filePath = requestedPath + '.md';
    const content = loadMarkdown(filePath);

    // Check if the requested page template exists
    if (content) {
        res.render(req.path.slice(1), { content });
    } else {
        res.status(404).send('Page not found');
    }
});

app.listen(3000);