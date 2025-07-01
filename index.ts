import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors'; // Importe o pacote cors
import usersRoutes from './routes/users.js'; // Roteador de usuários
import productsRoutes from './routes/products.js'; // Roteador de produtos
import cartRoutes from './routes/cart.js'; // Roteador de carrinho
import prisma from './prisma/client.js'; // Cliente Prisma

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

const app = express();
// Use a porta do ambiente (definida em .env) ou 3004 como padrão
const PORT = process.env.PORT ? parseInt(process.env.PORT as string, 10) : 3004;

// =================================================================
// ETAPA 3: MIDDLEWARES GLOBAIS
// =================================================================
// CORS: Permite requisições de diferentes origens.
// Em produção, você deve configurar as origens permitidas de forma mais restritiva.
app.use(cors({
    origin: process.env.FRONTEND_URL || '*', // Permita o frontend especificado ou todas as origens
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Métodos HTTP permitidos
    allowedHeaders: ['Content-Type', 'Authorization'], // Cabeçalhos permitidos
}));

// Body Parser: Habilita o Express a ler JSON do corpo das requisições
app.use(express.json());

// =================================================================
// ETAPA 4: ROTAS DA APLICAÇÃO
// =================================================================

// Rota de verificação de status da API (não tenta conectar/desconectar o DB a cada requisição)
app.get('/', async (req: Request, res: Response) => {
    // Apenas responde que a API está funcionando.
    // A conexão inicial do Prisma já garante que o DB esteja acessível.
    res.status(200).send('API de E-commerce de Roupas em Node.js - OK!');
});

// Rotas da aplicação montadas com seus respectivos prefixos
app.use('/users', usersRoutes);
app.use('/products', productsRoutes);
app.use('/cart', cartRoutes);

// =================================================================
// ETAPA 5: TRATAMENTO DE ERROS DE ROTA (middleware)
// =================================================================
// Este middleware captura erros que ocorrem nas rotas e envia uma resposta padronizada.
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
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
        await prisma.$connect();
        console.log('>>> Conexão inicial com o banco de dados (Prisma) estabelecida com sucesso!');
    } catch (err) {
        console.error('>>> ERRO: Falha ao conectar ao banco de dados (Prisma).', err);
        // Em um ambiente real, você pode querer tentar reconectar ou logar mais detalhes.
        // O `process.exit(1)` no handler global já cuidaria disso.
    }
});

// Garante que a conexão com o Prisma seja encerrada quando o processo for finalizado
// (Ex: Ctrl+C no terminal)
process.on('SIGINT', async () => {
    console.log('>>> Sinal de interrupção recebido. Desconectando do banco de dados...');
    await prisma.$disconnect();
    console.log('>>> Desconectado do banco de dados. Encerrando processo.');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('>>> Sinal de término recebido. Desconectando do banco de dados...');
    await prisma.$disconnect();
    console.log('>>> Desconectado do banco de dados. Encerrando processo.');
    process.exit(0);
});

// Exporta o app para testes ou outras integrações, se necessário
export default app;
