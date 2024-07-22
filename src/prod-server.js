const express = require('express');
const path = require('path');
const exphbs = require('express-handlebars');
const { getFileFromDatabase, getAllPartials } = require('./db');
const markdown = require('markdown-it')();
const Handlebars = require('handlebars');
var config = require('../config');

const app = express();

app.engine('hbs', exphbs.engine({ extname: '.hbs' }));
app.use(express.static(path.join(__dirname, '../public')));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, '/views'));


// Middleware to load partials from the database
app.use(/\/((?!favicon.ico).*)/,async (req, res, next) => {

    const orgName = req.originalUrl.split("/")[1];
    const url = config.adminAPI + "orgFileType?orgName=" + orgName + "&fileType=partials";
    //attach partials
    const partialsResponse = await fetch(url);
    var partials = await partialsResponse.json();
    var partialObject = {}
    partials.forEach(file => {
        var fileName = file.pageName.split(".")[0];
        var replaceUrl = config.adminAPI + "orgFiles?orgName=" + orgName;
        var fileContent = file.pageContent.replace("/images/", replaceUrl + "&fileName=");
        partialObject[fileName] = fileContent;
    });
    const hbs = exphbs.create({});
    hbs.handlebars.partials = partialObject
    next()
});

// Route to render Handlebars templates fetched from the database
app.get('/((?!favicon.ico)):orgName', async (req, res) => {

    const url = config.adminAPI + "orgFiles?orgName=" + req.params.orgName;
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

app.get('/((?!favicon.ico)):orgName/api/:apiName', async (req, res) => {

    const orgFilesUrl = config.adminAPI + "orgFiles?orgName=" + req.params.orgName;
    const apiContetnUrl = config.apiMetaDataAPI + "apiFiles?orgName=" + req.params.orgName + "&apiID=" + req.params.apiName;
    const apiMetaDataUrl = config.apiMetaDataAPI + "api?orgName=" + req.params.orgName + "&apiID=" + req.params.apiName;

    const templateResponse = await fetch(orgFilesUrl + "&fileName=apiTemplate.hbs");
    var templateContent = await templateResponse.text();

    const layoutResponse = await fetch(orgFilesUrl + "&fileName=main.hbs");
    var layoutContent = await layoutResponse.text();
    layoutContent = layoutContent.replaceAll("/styles/", orgFilesUrl + "&fileName=");

    const metadataResponse = await fetch(apiMetaDataUrl);
    const metaData = await metadataResponse.json();

    const apiContentResponse = await fetch(apiContetnUrl + "&fileName=apiContent.md");
    const apiContent = await apiContentResponse.text();
    const apiContentHtml = apiContent ? markdown.render(apiContent) : '';

    const template = Handlebars.compile(templateContent.toString());
    const layout = Handlebars.compile(layoutContent.toString());

    var html = layout({
        body: template({
            apiMetadata: metaData,
            content: apiContentHtml,
        }),
    });

    html = html.replaceAll("/images/", apiContetnUrl + "&fileName=")
    res.send(html);

});

app.get('/((?!favicon.ico)):orgName/api/:apiName/tryout', async (req, res) => {

    const apiMetaDataUrl = config.apiMetaDataAPI + "apiDefinition?orgName=" + req.params.orgName + "&apiID=" + req.params.apiName;
    const metadataResponse = await fetch(apiMetaDataUrl);
    const metaData = await metadataResponse.text();
    // const openApiDefinition =JSON.parse(metaData);

    res.render('tryout', {
        apiMetadata: metaData
    });

});

app.listen(3000);