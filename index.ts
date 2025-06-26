// =================================================================
// ETAPA 1: CAPTURA DE ERROS (NO TOPO)
// =================================================================
process.on('uncaughtException', (err, origin) => {
  console.error('======================================================');
  console.error('ERRO: EXCEÇÃO NÃO CAPTURADA');
  console.error('======================================================');
  console.error('--> O ERRO É ESTE: ', err);
  console.error('Origem do erro:', origin);
  console.error('------------------------------------------------------');
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('======================================================');
  console.error('ERRO: REJEIÇÃO DE PROMISE NÃO TRATADA');
  console.error('======================================================');
  console.error('--> A CAUSA DO ERRO É ESTA: ', reason);
  console.error('------------------------------------------------------');
});

// =================================================================
// ETAPA 2: IMPORTS (TODOS JUNTOS)
// =================================================================
import express from 'express';
import cors from 'cors';
import usersRoutes from './routes/users.js';
import productsRoutes from './routes/products.js';
import cartRoutes from './routes/cart.js';
import prisma from './prisma/client.js';

console.log('>>> Todos os módulos foram importados com sucesso.');

// =================================================================
// ETAPA 3: LÓGICA DO SERVIDOR (CÓDIGO ORIGINAL REATIVADO)
// =================================================================
const app = express();
const port = 3004;

app.use(express.json());
app.use(cors());

// Rota de verificação de conexão com o banco de dados
app.get('/', async (req, res) => {
  try {
    console.log('Tentando conectar ao banco de dados...');
    await prisma.$connect();
    console.log('Conexão com o banco de dados bem-sucedida!');
    res.send('API de E-commerce de Roupas em Node.js - Conexão DB OK!');
  } catch (error) {
    // Se a conexão falhar, o erro será capturado aqui E pelo nosso handler global
    console.error("Erro explícito na rota '/':", error);
    res.status(500).send('API de E-commerce de Roupas em Node.js - Erro de Conexão DB!');
  } finally {
    await prisma.$disconnect();
    console.log('Desconectado do banco de dados.');
  }
});

// Rotas da aplicação
app.use('/users', usersRoutes);
app.use('/products', productsRoutes);
app.use('/cart', cartRoutes);

// Iniciando o servidor
app.listen(port, () => {
  console.log(`>>> Servidor rodando na porta ${port}. Aguardando requisições...`);
  // Adicionamos uma verificação inicial para provocar o erro, se ele existir.
  console.log('>>> Realizando uma verificação de conexão inicial com o Prisma...');
  prisma.$connect()
    .then(() => {
        console.log('>>> Verificação inicial com o Prisma foi bem-sucedida!');
        prisma.$disconnect();
    })
    .catch(err => {
        // Este catch é importante para ver o erro imediatamente na inicialização
        console.error('>>> Falha na verificação de conexão inicial com o Prisma.');
    });
});