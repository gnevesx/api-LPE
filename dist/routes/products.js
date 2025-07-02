"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const express_1 = require("express");
const zod_1 = require("zod");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_js_1 = __importDefault(require("../prisma/client.js"));
const router = (0, express_1.Router)();
// Middleware de autenticação
const verifyToken = (req, res, next) => {
    const token = req.headers['x-access-token'];
    if (!token) {
        return res.status(403).json({ message: "Token não fornecido" });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_KEY);
        req.userId = decoded.userId;
        req.userRole = decoded.userRole;
        next();
    }
    catch (error) {
        return res.status(401).json({ message: "Token inválido" });
    }
};
// Middleware de verificação de admin
const verifyAdmin = (req, res, next) => {
    if (req.userRole !== client_1.Role.ADMIN) {
        return res.status(403).json({ message: "Acesso negado: requer administrador" });
    }
    next();
};
// Schemas Zod
const productSchema = zod_1.z.object({
    name: zod_1.z.string().min(3, { message: "Nome deve ter no mínimo 3 caracteres" }),
    description: zod_1.z.string().min(10).optional().nullable(),
    price: zod_1.z.number().positive({ message: "Preço deve ser positivo" }),
    imageUrl: zod_1.z.string().url().optional().nullable(),
    category: zod_1.z.string().optional().nullable(),
    size: zod_1.z.string().optional().nullable(),
    color: zod_1.z.string().optional().nullable(),
    stock: zod_1.z.number().int().min(0).optional().default(0),
});
const productUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(3).optional(),
    description: zod_1.z.string().min(10).optional().nullable(),
    price: zod_1.z.number().positive().optional(),
    imageUrl: zod_1.z.string().url().optional().nullable(),
    category: zod_1.z.string().optional().nullable(),
    size: zod_1.z.string().optional().nullable(),
    color: zod_1.z.string().optional().nullable(),
    stock: zod_1.z.number().int().min(0).optional(),
});
// GET /products
router.get("/", async (_req, res) => {
    try {
        const products = await client_js_1.default.product.findMany();
        res.status(200).json(products);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao buscar produtos" });
    }
});
// GET /products/:id
router.get("/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const product = await client_js_1.default.product.findUnique({ where: { id } });
        if (!product) {
            return res.status(404).json({ message: "Produto não encontrado" });
        }
        res.status(200).json(product);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao buscar produto" });
    }
});
// POST /products (admin)
router.post("/", verifyToken, verifyAdmin, async (req, res) => {
    const validation = productSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
    }
    try {
        const product = await client_js_1.default.product.create({ data: validation.data });
        res.status(201).json(product);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao criar produto" });
    }
});
// PUT /products/:id (admin)
router.put("/:id", verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    const validation = productUpdateSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
    }
    try {
        const product = await client_js_1.default.product.update({
            where: { id },
            data: validation.data
        });
        res.status(200).json(product);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao atualizar produto" });
    }
});
// DELETE /products/:id (admin)
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const deleted = await client_js_1.default.product.delete({ where: { id } });
        res.status(200).json({ message: `Produto '${deleted.name}' deletado.` });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao deletar produto" });
    }
});
// GET /products/search/:term
router.get("/search/:term", async (req, res) => {
    const { term } = req.params;
    try {
        const products = await client_js_1.default.product.findMany({
            where: {
                OR: [
                    { name: { contains: term, mode: "insensitive" } },
                    { description: { contains: term, mode: "insensitive" } },
                    { category: { contains: term, mode: "insensitive" } },
                    { color: { contains: term, mode: "insensitive" } },
                ]
            }
        });
        res.status(200).json(products);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro na busca" });
    }
});
exports.default = router;
