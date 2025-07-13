// File: src/services/calendar.service.js

const { google } = require('googleapis');
const config = require('../config'); // Importa nossa configuração central

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// Validação para garantir que as credenciais foram carregadas antes de tentar usá-las.
if (!config.google.credentialsJson) {
    throw new Error('As credenciais do Google (GOOGLE_CREDENTIALS_JSON) não foram encontradas nas variáveis de ambiente.');
}

// 1. "Lê" o JSON das credenciais que foi armazenado na variável de ambiente.
const credentials = JSON.parse(config.google.credentialsJson);

// 2. Inicializa a autenticação com o Google usando as credenciais da Service Account.
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
});

// 3. Cria a instância do cliente da API do Google Agenda.
const calendar = google.calendar({ version: 'v3', auth });

/**
 * Cria um novo evento em uma agenda específica do Google.
 * @param {string} calendarId - O ID da agenda da clínica onde o evento será criado.
 * @param {object} eventDetails - Detalhes do evento.
 * @param {string} eventDetails.summary - O título do evento (ex: "Consulta - Jorge").
 * @param {string} eventDetails.description - A descrição do evento.
 * @param {string} eventDetails.startDateTime - Data e hora de início no formato ISO 8601.
 * @param {string} eventDetails.endDateTime - Data e hora de fim no formato ISO 8601.
 * @returns {Promise<object>} O objeto do evento criado.
 */
async function createEvent(calendarId, eventDetails) {
    // Validação para garantir que a função não prossiga sem um ID de agenda.
    if (!calendarId) {
        console.error('❌ Erro Crítico: Tentativa de criar evento sem um calendarId.');
        throw new Error('O ID da agenda da clínica não foi configurado.');
    }

    try {
        console.log(`[CalendarService] Criando evento na agenda: ${calendarId}`);
        
        const response = await calendar.events.insert({
            calendarId: calendarId, // Usa o ID da agenda recebido dinamicamente
            resource: {
                summary: eventDetails.summary,
                description: eventDetails.description,
                start: {
                    dateTime: eventDetails.startDateTime,
                    timeZone: 'America/Sao_Paulo', // Pode ser configurado por clínica no futuro
                },
                end: {
                    dateTime: eventDetails.endDateTime,
                    timeZone: 'America/Sao_Paulo',
                },
            },
        });
        
        console.log('✅ Evento criado com sucesso:', response.data.htmlLink);
        return response.data;

    } catch (error) {
        console.error(`❌ Erro ao criar evento no Google Agenda (${calendarId}):`, error.message);
        throw error; // Lança o erro para ser tratado pelo chamador (nepq.handler.js)
    }
}

module.exports = { createEvent };
