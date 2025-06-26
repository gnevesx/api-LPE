import { Role } from "@prisma/client";
import { Router, Request, Response, NextFunction } from "express";
import bcrypt from 'bcrypt';
import { z } from 'zod';
import jwt from "jsonwebtoken";
import prisma from '../prisma/client.js';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

// --- Extensão da tipagem do Express Request para incluir userId e userRole ---
// Esta declaração adiciona as propriedades customizadas 'userId' e 'userRole'
// à interface Request do Express, permitindo o uso com tipagem segura.
declare global {
    namespace Express {
        interface Request {
            userId?: string;
            userRole?: Role;
        }
    }
}

const router = Router();

// --- Schemas de Validação (Zod) ---
const userCreateSchema = z.object({
    name: z.string().min(3, { message: "O nome deve possuir, no mínimo, 3 caracteres." }),
    email: z.string().email({ message: "O e-mail fornecido é inválido." }),
    password: z.string().min(8, { message: "A senha deve possuir, no mínimo, 8 caracteres." }),
    role: z.nativeEnum(Role).optional(),
});

const userUpdateSchema = z.object({
    name: z.string().min(3, { message: "O nome deve possuir, no mínimo, 3 caracteres." }).optional(),
    email: z.string().email({ message: "O e-mail fornecido é inválido." }).optional(),
    password: z.string().min(8, { message: "A senha deve possuir, no mínimo, 8 caracteres." }).optional(),
    role: z.nativeEnum(Role).optional(),
});

const forgotPasswordSchema = z.object({
    email: z.string().email({ message: "O e-mail fornecido é inválido." }),
});

const resetPasswordSchema = z.object({
    email: z.string().email({ message: "O e-mail fornecido é inválido." }),
    recoveryCode: z.string().length(6, { message: "O código de recuperação deve ter exatamente 6 caracteres." }),
    newPassword: z.string().min(8, { message: "A nova senha deve possuir, no mínimo, 8 caracteres." }),
});


// --- Função de Validação de Senha ---
function validatePasswordComplexity(password: string): string[] {
    const messages: string[] = [];
    if (!/.{8,}/.test(password)) messages.push("A senha deve possuir, no mínimo, 8 caracteres.");
    if (!/[a-z]/.test(password)) messages.push("A senha deve possuir ao menos uma letra minúscula.");
    if (!/[A-Z]/.test(password)) messages.push("A senha deve possuir ao menos uma letra maiúscula.");
    if (!/[0-9]/.test(password)) messages.push("A senha deve possuir ao menos um número.");
    if (!/[^a-zA-Z0-9]/.test(password)) messages.push("A senha deve possuir ao menos um símbolo (ex: !@#$%).");
    return messages;
}


// --- Configuração do Nodemailer ---
// CORREÇÃO: Removido o objeto 'tls' para garantir a segurança em produção.
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT as string, 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});


// --- Middlewares de Autenticação e Autorização ---
// CORREÇÃO: Tipagem correta e lógica para o padrão "Authorization: Bearer <token>"
const verifyToken = (req: Request, res: Response, next: NextFunction) => {
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
        const decoded = jwt.verify(token, process.env.JWT_KEY as string) as { userId: string, userRole: Role };
        req.userId = decoded.userId;
        req.userRole = decoded.userRole;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Token inválido ou expirado." });
    }
};

const verifyAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.userRole !== Role.ADMIN) {
        return res.status(403).json({ message: "Acesso negado: Requer privilégios de administrador." });
    }
    next();
};


// --- ROTAS ---

// Rota: GET /users (apenas para ADMIN)
router.get("/", verifyToken, verifyAdmin, async (req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }
        });
        res.status(200).json(users);
    } catch (error) {
        console.error("Erro ao buscar usuários:", error);
        res.status(500).json({ error: "Ocorreu um erro interno ao buscar os usuários." });
    }
});

// Rota: POST /users (criação de novo usuário)
router.post("/", async (req: Request, res: Response) => {
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
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ message: "Este e-mail já está em uso." });
        }

        // CORREÇÃO: Usando versões assíncronas do bcrypt para não bloquear o servidor
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await prisma.user.create({
            data: { name, email, password: hashedPassword, role: role || Role.VISITOR },
            select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }
        });
        res.status(201).json(newUser);
    } catch (error) {
        console.error("Erro ao criar usuário:", error);
        res.status(500).json({ error: "Ocorreu um erro interno ao criar o usuário." });
    }
});

// Rota de Login: POST /users/login
router.post("/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ erro: "E-mail e senha são obrigatórios." });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ erro: "Credenciais inválidas." });
        }

        // CORREÇÃO: Usando versão assíncrona e segura do bcrypt.compare
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (isPasswordValid) {
            const token = jwt.sign(
                { userId: user.id, userRole: user.role },
                process.env.JWT_KEY as string,
                { expiresIn: "8h" }
            );
            res.status(200).json({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                token
            });
        } else {
            res.status(401).json({ erro: "Credenciais inválidas." });
        }
    } catch (error) {
        console.error("Erro no login:", error);
        res.status(500).json({ erro: "Ocorreu um erro interno ao tentar fazer login." });
    }
});

// Rota: POST /users/forgot-password (Solicitar Código de Recuperação)
router.post("/forgot-password", async (req: Request, res: Response) => {
    const validation = forgotPasswordSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ erro: validation.error.issues[0].message });
    }

    const { email } = validation.data;
    const successMessage = "Se um e-mail correspondente for encontrado em nosso sistema, um código de recuperação será enviado.";

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
            const recoveryCode = crypto.randomBytes(3).toString('hex').toUpperCase();
            const recoveryCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

            await prisma.user.update({
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

    } catch (error) {
        console.error("Erro ao solicitar recuperação de senha:", error);
        res.status(500).json({ erro: "Ocorreu um erro ao processar sua solicitação." });
    }
});

// Rota: POST /users/reset-password (Alterar Senha com Código)
router.post("/reset-password", async (req: Request, res: Response) => {
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
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.recoveryCode !== recoveryCode || !user.recoveryCodeExpiresAt || user.recoveryCodeExpiresAt < new Date()) {
            return res.status(400).json({ erro: "Código de recuperação inválido ou expirado." });
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword, recoveryCode: null, recoveryCodeExpiresAt: null },
        });
        res.status(200).json({ message: "Senha alterada com sucesso." });
    } catch (error) {
        console.error("Erro ao resetar senha:", error);
        res.status(500).json({ erro: "Ocorreu um erro ao alterar a senha." });
    }
});

// Rota: GET /users/:id (busca usuário por ID)
router.get("/:id", verifyToken, async (req: Request, res: Response) => {
    if (req.userRole !== Role.ADMIN && req.userId !== req.params.id) {
        return res.status(403).json({ message: "Acesso negado. Você só pode visualizar seu próprio perfil." });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }
        });
        if (!user) {
            return res.status(404).json({ message: "Usuário não encontrado." });
        }
        res.status(200).json(user);
    } catch (error) {
        console.error("Erro ao buscar usuário por ID:", error);
        res.status(500).json({ error: "Ocorreu um erro interno ao buscar o usuário." });
    }
});

// Rota: PUT /users/:id (atualiza usuário)
router.put("/:id", verifyToken, async (req: Request, res: Response) => {
    if (req.userRole !== Role.ADMIN && req.userId !== req.params.id) {
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
        const dataToUpdate: any = {};
        if (name) dataToUpdate.name = name;
        if (email) {
            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser && existingUser.id !== req.params.id) {
                return res.status(409).json({ message: "Este e-mail já está em uso por outro usuário." });
            }
            dataToUpdate.email = email;
        }
        if (password) {
            const salt = await bcrypt.genSalt(12);
            dataToUpdate.password = await bcrypt.hash(password, salt);
        }

        // CORREÇÃO: Lógica de atualização de role corrigida e mais segura
        if (role) {
            if (req.userRole === Role.ADMIN) {
                dataToUpdate.role = role;
            } else {
                return res.status(403).json({ message: "Você não tem permissão para alterar funções." });
            }
        }
        
        const updatedUser = await prisma.user.update({
            where: { id: req.params.id },
            data: dataToUpdate,
            select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true }
        });
        res.status(200).json(updatedUser);
    } catch (error) {
        console.error("Erro ao atualizar usuário:", error);
        res.status(500).json({ error: "Ocorreu um erro interno ao atualizar o usuário." });
    }
});

// Rota: DELETE /users/:id (apenas para ADMIN)
router.delete("/:id", verifyToken, verifyAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await prisma.user.delete({ where: { id } });
        // CORREÇÃO: Usando status 204 No Content para delete, que é uma prática comum.
        res.status(204).send();
    } catch (error) {
        console.error("Erro ao deletar usuário:", error);
        res.status(500).json({ error: "Ocorreu um erro interno ao deletar o usuário." });
    }
});

export default router;