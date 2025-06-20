// src/app.js
const express = require('express');
const bodyParser = require('body-parser');
const allRoutes = require('./routes'); // Importa o roteador principal

const app = express();

// Middlewares
app.use(bodyParser.json());

// Rota principal da aplicação
app.use('/', allRoutes);

module.exports = app;
