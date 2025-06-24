const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

// Cria uma única instância do cliente Supabase para ser usada na aplicação.
const supabase = createClient(config.supabase.url, config.supabase.apiKey);

module.exports = supabase;
