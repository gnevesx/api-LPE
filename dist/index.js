"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv")); // Importe o dotenv
const cors_1 = __importDefault(require("cors")); // Importe o pacote cors
const users_js_1 = __importDefault(require("./routes/users.js")); // Roteador de usuários
const products_js_1 = __importDefault(require("./routes/products.js")); // Roteador de produtos
const cart_js_1 = __importDefault(require("./routes/cart.js")); // Roteador de carrinho
const client_js_1 = __importDefault(require("./prisma/client.js")); // Cliente Prisma
// =================================================================
// ETAPA 1: CAPTURA DE ERROS GLOBAIS (NO TOPO)
// =================================================================
// Captura exceções não tratadas (erros síncronos)
process.on('uncaughtException', (err, origin) => {
    console.error('======================================================');
    console.error('ERRO: EXCEÇÃO NÃO CAPTURADA');
    console.error('======================================================');
    console.error('--> O ERRO É ESTE: ', err);
    console.error('Origem do erro:', origin);
    console.error('------------------------------------------------------');
    process.exit(1); // Encerra o processo para evitar estado inconsistente
});
// Captura rejeições de Promises não tratadas (erros assíncronos)
process.on('unhandledRejection', (reason, promise) => {
    console.error('======================================================');
    console.error('ERRO: REJEIÇÃO DE PROMISE NÃO TRATADA');
    console.error('======================================================');
    console.error('--> A CAUSA DO ERRO É ESTA: ', reason);
    console.error('------------------------------------------------------');
    // Em produção, você pode querer registrar isso e não sair imediatamente
    // Depende da gravidade e da resiliência desejada.
});
// =================================================================
// ETAPA 2: CONFIGURAÇÃO INICIAL E IMPORTS
// =================================================================
// Carrega as variáveis de ambiente do arquivo .env
dotenv_1.default.config(); // <<<<<<<<<<<<<<<< ESTA LINHA ESTAVA FALTANDO!
console.log('>>> Todos os módulos foram importados com sucesso.');
const app = (0, express_1.default)();
// Use a porta do ambiente (definida em .env) ou 3004 como padrão
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3004;
// =================================================================
// ETAPA 3: MIDDLEWARES GLOBAIS
// =================================================================
// CORS: Permite requisições de diferentes origens.
// Em produção, você deve configurar as origens permitidas de forma mais restritiva.
const corsOptions = {
    origin: process.env.FRONTEND_URL || '*', // Permita o frontend especificado ou todas as origens
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Métodos HTTP permitidos
    allowedHeaders: ['Content-Type', 'Authorization'], // Cabeçalhos permitidos
};
// Adiciona um log para verificar qual origem está sendo usada
console.log('>>> CORS configurado com origin:', corsOptions.origin);
app.use((0, cors_1.default)(corsOptions)); // Use o objeto corsOptions
// Body Parser: Habilita o Express a ler JSON do corpo das requisições
app.use(express_1.default.json());
// =================================================================
// ETAPA 4: ROTAS DA APLICAÇÃO
// =================================================================
// Rota de verificação de status da API (não tenta conectar/desconectar o DB a cada requisição)
app.get('/', async (req, res) => {
    // Apenas responde que a API está funcionando.
    // A conexão inicial do Prisma já garante que o DB esteja acessível.
    res.status(200).send('API de E-commerce de Roupas em Node.js - OK!');
});
// Rotas da aplicação montadas com seus respectivos prefixos
app.use('/users', users_js_1.default);
app.use('/products', products_js_1.default);
app.use('/cart', cart_js_1.default);
// =================================================================
// ETAPA 5: TRATAMENTO DE ERROS DE ROTA (middleware)
// =================================================================
// Este middleware captura erros que ocorrem nas rotas e envia uma resposta padronizada.
app.use((err, req, res, next) => {
    console.error('Erro na requisição:', err.stack);
    res.status(500).json({ error: 'Erro interno do servidor.' });
});
// =================================================================
// ETAPA 6: INICIALIZAÇÃO DO SERVIDOR E CONEXÃO COM O BANCO DE DADOS
// =================================================================
// Iniciando o servidor e conectando ao banco de dados UMA VEZ
app.listen(PORT, async () => {
    console.log(`>>> Servidor rodando na porta ${PORT}. Aguardando requisições...`);
    // Realiza a conexão inicial com o Prisma.
    // Se falhar aqui, o processo será encerrado pelo 'unhandledRejection'
    // ou 'uncaughtException' (dependendo de como o erro é propagado).
    try {
        await client_js_1.default.$connect();
        console.log('>>> Conexão inicial com o banco de dados (Prisma) estabelecida com sucesso!');
    }
    catch (err) {
        console.error('>>> ERRO: Falha ao conectar ao banco de dados (Prisma).', err);
        // Em um ambiente real, você pode querer tentar reconectar ou logar mais detalhes.
        // O `process.exit(1)` no handler global já cuidaria disso.
    }
});
// Garante que a conexão com o Prisma seja encerrada quando o processo for finalizado
// (Ex: Ctrl+C no terminal)
process.on('SIGINT', async () => {
    console.log('>>> Sinal de interrupção recebido. Desconectando do banco de dados...');
    await client_js_1.default.$disconnect();
    console.log('>>> Desconectado do banco de dados. Encerrando processo.');
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('>>> Sinal de término recebido. Desconectando do banco de dados...');
    await client_js_1.default.$disconnect();
    console.log('>>> Desconectado do banco de dados. Encerrando processo.');
    process.exit(0);
});
// Exporta o app para testes ou outras integrações, se necessário
exports.default = app;
