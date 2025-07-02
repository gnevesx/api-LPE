"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const zod_1 = require("zod");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_js_1 = __importDefault(require("../prisma/client.js"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
// --- Schemas de Validação (Zod) ---
const userCreateSchema = zod_1.z.object({
    name: zod_1.z.string().min(3, { message: "O nome deve possuir, no mínimo, 3 caracteres." }),
    email: zod_1.z.string().email({ message: "O e-mail fornecido é inválido." }),
    password: zod_1.z.string().min(8, { message: "A senha deve possuir, no mínimo, 8 caracteres." }),
    role: zod_1.z.nativeEnum(client_1.Role).optional(),
});
const userUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(3, { message: "O nome deve possuir, no mínimo, 3 caracteres." }).optional(),
    email: zod_1.z.string().email({ message: "O e-mail fornecido é inválido." }).optional(),
    password: zod_1.z.string().min(8, { message: "A senha deve possuir, no mínimo, 8 caracteres." }).optional(),
    role: zod_1.z.nativeEnum(client_1.Role).optional(),
});
const forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email({ message: "O e-mail fornecido é inválido." }),
});
const resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email({ message: "O e-mail fornecido é inválido." }),
    recoveryCode: zod_1.z.string().length(6, { message: "O código de recuperação deve ter exatamente 6 caracteres." }),
    newPassword: zod_1.z.string().min(8, { message: "A nova senha deve possuir, no mínimo, 8 caracteres." }),
});
// --- Função de Validação de Senha ---
function validatePasswordComplexity(password) {
    const messages = [];
    if (!/.{8,}/.test(password))
        messages.push("A senha deve possuir, no mínimo, 8 caracteres.");
    if (!/[a-z]/.test(password))
        messages.push("A senha deve possuir ao menos uma letra minúscula.");
    if (!/[A-Z]/.test(password))
        messages.push("A senha deve possuir ao menos uma letra maiúscula.");
    if (!/[0-9]/.test(password))
        messages.push("A senha deve possuir ao menos um número.");
    if (!/[^a-zA-Z0-9]/.test(password))
        messages.push("A senha deve possuir ao menos um símbolo (ex: !@#$%).");
    return messages;
}
// --- Configuração do Nodemailer ---
// CORREÇÃO: Removido o objeto 'tls' para garantir a segurança em produção.
const transporter = nodemailer_1.default.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});
// --- Middlewares de Autenticação e Autorização ---
// CORREÇÃO: Tipagem correta e lógica para o padrão "Authorization: Bearer <token>"
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ message: "Token de autenticação não fornecido." });
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({ message: "Erro no formato do token. Utilize o formato: Bearer <token>" });
    }
    const token = parts[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_KEY);
        req.userId = decoded.userId;
        req.userRole = decoded.userRole;
        next();
    }
    catch (error) {
        return res.status(401).json({ message: "Token inválido ou expirado." });
    }
};
const verifyAdmin = (req, res, next) => {
    if (req.userRole !== client_1.Role.ADMIN) {
        return res.status(403).json({ message: "Acesso negado: Requer privilégios de administrador." });
    }
    next();
};
// --- ROTAS ---
// Rota: GET /users (apenas para ADMIN)
router.get("/", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const users = await client_js_1.default.user.findMany({
            select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }
        });
        res.status(200).json(users);
    }
    catch (error) {
        console.error("Erro ao buscar usuários:", error);
        res.status(500).json({ error: "Ocorreu um erro interno ao buscar os usuários." });
    }
});
// Rota: POST /users (criação de novo usuário)
router.post("/", async (req, res) => {
    const validation = userCreateSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ errors: validation.error.format() });
    }
    const { name, email, password, role } = validation.data;
    const passwordErrors = validatePasswordComplexity(password);
    if (passwordErrors.length > 0) {
        return res.status(400).json({ errors: passwordErrors });
    }
    try {
        const existingUser = await client_js_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ message: "Este e-mail já está em uso." });
        }
        // CORREÇÃO: Usando versões assíncronas do bcrypt para não bloquear o servidor
        const salt = await bcrypt_1.default.genSalt(12);
        const hashedPassword = await bcrypt_1.default.hash(password, salt);
        const newUser = await client_js_1.default.user.create({
            data: { name, email, password: hashedPassword, role: role || client_1.Role.VISITOR },
            select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }
        });
        res.status(201).json(newUser);
    }
    catch (error) {
        console.error("Erro ao criar usuário:", error);
        res.status(500).json({ error: "Ocorreu um erro interno ao criar o usuário." });
    }
});
// Rota de Login: POST /users/login
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ erro: "E-mail e senha são obrigatórios." });
    }
    try {
        const user = await client_js_1.default.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ erro: "Credenciais inválidas." });
        }
        // CORREÇÃO: Usando versão assíncrona e segura do bcrypt.compare
        const isPasswordValid = await bcrypt_1.default.compare(password, user.password);
        if (isPasswordValid) {
            const token = jsonwebtoken_1.default.sign({ userId: user.id, userRole: user.role }, process.env.JWT_KEY, { expiresIn: "8h" });
            res.status(200).json({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                token
            });
        }
        else {
            res.status(401).json({ erro: "Credenciais inválidas." });
        }
    }
    catch (error) {
        console.error("Erro no login:", error);
        res.status(500).json({ erro: "Ocorreu um erro interno ao tentar fazer login." });
    }
});
// Rota: POST /users/forgot-password (Solicitar Código de Recuperação)
router.post("/forgot-password", async (req, res) => {
    const validation = forgotPasswordSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ erro: validation.error.issues[0].message });
    }
    const { email } = validation.data;
    const successMessage = "Se um e-mail correspondente for encontrado em nosso sistema, um código de recuperação será enviado.";
    try {
        const user = await client_js_1.default.user.findUnique({ where: { email } });
        if (user) {
            const recoveryCode = crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
            const recoveryCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
            await client_js_1.default.user.update({
                where: { id: user.id },
                data: { recoveryCode, recoveryCodeExpiresAt },
            });
            await transporter.sendMail({
                from: `"Suporte [Nome do App]" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Seu Código de Recuperação de Senha',
                html: `<p>Olá ${user.name},</p><p>Seu código de recuperação é: <strong>${recoveryCode}</strong></p><p>Este código expira em 15 minutos.</p>`,
            });
        }
        // CORREÇÃO: Enviando a mesma resposta sempre para evitar enumeração de usuários
        res.status(200).json({ message: successMessage });
    }
    catch (error) {
        console.error("Erro ao solicitar recuperação de senha:", error);
        res.status(500).json({ erro: "Ocorreu um erro ao processar sua solicitação." });
    }
});
// Rota: POST /users/reset-password (Alterar Senha com Código)
router.post("/reset-password", async (req, res) => {
    const validation = resetPasswordSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ erro: validation.error.issues[0].message });
    }
    const { email, recoveryCode, newPassword } = validation.data;
    const passwordErrors = validatePasswordComplexity(newPassword);
    if (passwordErrors.length > 0) {
        return res.status(400).json({ errors: passwordErrors });
    }
    try {
        const user = await client_js_1.default.user.findUnique({ where: { email } });
        if (!user || user.recoveryCode !== recoveryCode || !user.recoveryCodeExpiresAt || user.recoveryCodeExpiresAt < new Date()) {
            return res.status(400).json({ erro: "Código de recuperação inválido ou expirado." });
        }
        const salt = await bcrypt_1.default.genSalt(12);
        const hashedPassword = await bcrypt_1.default.hash(newPassword, salt);
        await client_js_1.default.user.update({
            where: { id: user.id },
            data: { password: hashedPassword, recoveryCode: null, recoveryCodeExpiresAt: null },
        });
        res.status(200).json({ message: "Senha alterada com sucesso." });
    }
    catch (error) {
        console.error("Erro ao resetar senha:", error);
        res.status(500).json({ erro: "Ocorreu um erro ao alterar a senha." });
    }
});
// Rota: GET /users/:id (busca usuário por ID)
router.get("/:id", verifyToken, async (req, res) => {
    if (req.userRole !== client_1.Role.ADMIN && req.userId !== req.params.id) {
        return res.status(403).json({ message: "Acesso negado. Você só pode visualizar seu próprio perfil." });
    }
    try {
        const user = await client_js_1.default.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }
        });
        if (!user) {
            return res.status(404).json({ message: "Usuário não encontrado." });
        }
        res.status(200).json(user);
    }
    catch (error) {
        console.error("Erro ao buscar usuário por ID:", error);
        res.status(500).json({ error: "Ocorreu um erro interno ao buscar o usuário." });
    }
});
// Rota: PUT /users/:id (atualiza usuário)
router.put("/:id", verifyToken, async (req, res) => {
    if (req.userRole !== client_1.Role.ADMIN && req.userId !== req.params.id) {
        return res.status(403).json({ message: "Acesso negado. Você só pode atualizar seu próprio perfil." });
    }
    const validation = userUpdateSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ errors: validation.error.format() });
    }
    const { name, email, password, role } = validation.data;
    if (password) {
        const passwordErrors = validatePasswordComplexity(password);
        if (passwordErrors.length > 0) {
            return res.status(400).json({ errors: passwordErrors });
        }
    }
    try {
        const dataToUpdate = {};
        if (name)
            dataToUpdate.name = name;
        if (email) {
            const existingUser = await client_js_1.default.user.findUnique({ where: { email } });
            if (existingUser && existingUser.id !== req.params.id) {
                return res.status(409).json({ message: "Este e-mail já está em uso por outro usuário." });
            }
            dataToUpdate.email = email;
        }
        if (password) {
            const salt = await bcrypt_1.default.genSalt(12);
            dataToUpdate.password = await bcrypt_1.default.hash(password, salt);
        }
        // CORREÇÃO: Lógica de atualização de role corrigida e mais segura
        if (role) {
            if (req.userRole === client_1.Role.ADMIN) {
                dataToUpdate.role = role;
            }
            else {
                return res.status(403).json({ message: "Você não tem permissão para alterar funções." });
            }
        }
        const updatedUser = await client_js_1.default.user.update({
            where: { id: req.params.id },
            data: dataToUpdate,
            select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }
        });
        res.status(200).json(updatedUser);
    }
    catch (error) {
        console.error("Erro ao atualizar usuário:", error);
        res.status(500).json({ error: "Ocorreu um erro interno ao atualizar o usuário." });
    }
});
// Rota: DELETE /users/:id (apenas para ADMIN)
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await client_js_1.default.user.delete({ where: { id } });
        // CORREÇÃO: Usando status 204 No Content para delete, que é uma prática comum.
        res.status(204).send();
    }
    catch (error) {
        console.error("Erro ao deletar usuário:", error);
        res.status(500).json({ error: "Ocorreu um erro interno ao deletar o usuário." });
    }
});
exports.default = router;
