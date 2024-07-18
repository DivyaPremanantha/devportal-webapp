const express = require('express');
const path = require('path');
const exphbs = require('express-handlebars');
const { getFileFromDatabase, getAllPartials } = require('./db');
const markdown = require('markdown-it')();
const Handlebars = require('handlebars');
const app = express();

app.engine('hbs', exphbs.engine({ extname: '.hbs' }));
app.use(express.static(path.join(__dirname, '../public')));

app.set('view engine', 'hbs');

// Middleware to load partials from the database
app.use(async (req, res, next) => {

    const orgName = req.originalUrl.split("/")[1];
    const url = "http://localhost:8080/admin/orgFileType?orgName=" + orgName + "&fileType=partials";
    //attach partials
    const partialsResponse = await fetch(url);
    var partials = await partialsResponse.json();
    var partialObject = {}
    partials.forEach(file => {
        var fileName = file.pageName.split(".")[0];
        var replaceUrl = "http://localhost:8080/admin/orgFiles?orgName=" + orgName;
        var fileContent = file.pageContent.replace("/images/", replaceUrl + "&fileName=");
        partialObject[fileName] = fileContent;
    });
    const hbs = exphbs.create({});
    hbs.handlebars.partials = partialObject
    next()
});

// Route to render Handlebars templates fetched from the database
app.get('/((?!favicon.ico)):orgName', async (req, res) => {

    const url = "http://localhost:8080/admin/orgFiles?orgName=" + req.params.orgName;
    try {
        const templateResponse = await fetch(url + "&fileName=home.hbs");
        var templateContent = await templateResponse.text();
        templateContent = templateContent.replace("/images/", url + "&fileName=");
        const layoutResponse = await fetch(url + "&fileName=main.hbs");
        var layoutContent = await layoutResponse.text();
        layoutContent = layoutContent.replaceAll("/styles/", url + "&fileName=");
        const markdownResponse = await fetch(url + "&fileName=home.md");
        const markdownContent = await markdownResponse.text();
        const markdownHtml = markdownContent ? markdown.render(markdownContent) : '';
        const template = Handlebars.compile(templateContent.toString());
        const layout = Handlebars.compile(layoutContent.toString());

        const html = layout({
            body: template({
                content: markdownHtml
            }),
        });
        res.send(html);
    } catch (err) {
        console.log(err);
    }
});

app.listen(3000);