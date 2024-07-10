const express = require('express');
const path = require('path');
const exphbs = require('express-handlebars');
const { getFileFromDatabase, getAllPartials } = require('./db'); 
const markdown = require('markdown-it')();
const Handlebars = require('handlebars');
const app = express();

app.engine('hbs', exphbs.engine({extname: '.hbs' }));
app.use(express.static(path.join(__dirname, '../public')));

app.set('view engine', 'hbs');

// Middleware to fetch and serve CSS and image files from the database
app.use(async (req, res, next) => {
    const fileType = req.path.startsWith('/styles/') ? 'css' : (req.path.startsWith('/images/') ? 'image' : null);
    if (fileType) {
        const fileName = path.basename(req.path);
        const fileContent = await getFileFromDatabase(fileType, fileName);

        if (fileContent) {
            res.setHeader('Content-Type', fileType === 'css' ? 'text/css' : 'image/jpeg'); // Adjust MIME type as necessary
            return res.send(fileContent);
        } else {
            return res.status(404).send('File not found');
        }
    }
    next();
});

// Middleware to load partials from the database
app.use(async (req, res, next) => {
    const partials = await getAllPartials();
    const hbs = exphbs.create({});

    hbs.handlebars.partials = {
        ...hbs.handlebars.partials,
        ...partials,
    };

    next();
});

// Route to render Handlebars templates fetched from the database
app.get('/:orgName', async (req, res) => {
    const templateName = req.params.orgName;

    // Fetch the main template
    const templateContent = await getFileFromDatabase('template', `${templateName}.hbs`);
    if (!templateContent) {
        return res.status(404).send('Template not found');
    }

    // Fetch the layout
    const layoutContent = await getFileFromDatabase('layout', 'main.hbs');
    if (!layoutContent) {
        return res.status(404).send('Layout not found');
    }

    // Fetch the markdown content if it exists
    const markdownContent = await getFileFromDatabase('markdown', `${templateName}.md`);
    const markdownHtml = markdownContent ? markdown.render(markdownContent.toString()) : '';

    // Compile and render the Handlebars template
    const template = Handlebars.compile(templateContent.toString());
    const layout = Handlebars.compile(layoutContent.toString());

    const html = layout({
        body: template({
             content: markdownHtml 
        }),
    });

    res.send(html); // SSR: Server sends rendered HTML to client
});

app.listen(3000);