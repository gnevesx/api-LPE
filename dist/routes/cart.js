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
const addToCartSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid({ message: "ID do produto inválido" }),
    quantity: zod_1.z.number().int().min(1, { message: "Quantidade deve ser pelo menos 1" }),
});
const updateCartItemSchema = zod_1.z.object({
    quantity: zod_1.z.number().int().min(1, { message: "Quantidade deve ser pelo menos 1" }),
});
// GET /cart/:userId
router.get("/:userId", verifyToken, async (req, res) => {
    const { userId } = req.params;
    if (req.userRole !== client_1.Role.ADMIN && req.userId !== userId) {
        return res.status(403).json({ message: "Acesso negado" });
    }
    try {
        const cart = await client_js_1.default.cart.findUnique({
            where: { userId },
            include: {
                cartItems: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                price: true,
                                imageUrl: true,
                                stock: true,
                            }
                        }
                    }
                }
            }
        });
        res.status(200).json(cart || { userId, cartItems: [] });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao buscar carrinho" });
    }
});
// POST /cart/add
router.post("/add", verifyToken, async (req, res) => {
    const validation = addToCartSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
    }
    const { productId, quantity } = validation.data;
    const userId = req.userId;
    try {
        const product = await client_js_1.default.product.findUnique({ where: { id: productId } });
        if (!product) {
            return res.status(404).json({ message: "Produto não encontrado" });
        }
        if (product.stock < quantity) {
            return res.status(400).json({ message: `Estoque insuficiente para ${product.name}. Disponível: ${product.stock}` });
        }
        let cart = await client_js_1.default.cart.findUnique({ where: { userId } });
        if (!cart) {
            cart = await client_js_1.default.cart.create({ data: { userId } });
        }
        const existingCartItem = await client_js_1.default.cartItem.findFirst({
            where: { cartId: cart.id, productId },
        });
        const cartItem = existingCartItem
            ? await client_js_1.default.cartItem.update({
                where: { id: existingCartItem.id },
                data: { quantity: existingCartItem.quantity + quantity },
            })
            : await client_js_1.default.cartItem.create({
                data: { cartId: cart.id, productId, quantity },
            });
        res.status(200).json({ message: "Item adicionado ao carrinho", cartItem });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao adicionar item ao carrinho" });
    }
});
// PUT /cart/update/:cartItemId
router.put("/update/:cartItemId", verifyToken, async (req, res) => {
    const { cartItemId } = req.params;
    const validation = updateCartItemSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
    }
    const { quantity } = validation.data;
    const userId = req.userId;
    try {
        const cartItem = await client_js_1.default.cartItem.findUnique({
            where: { id: cartItemId },
            include: { cart: true, product: true }
        });
        if (!cartItem) {
            return res.status(404).json({ message: "Item do carrinho não encontrado" });
        }
        if (cartItem.cart.userId !== userId && req.userRole !== client_1.Role.ADMIN) {
            return res.status(403).json({ message: "Acesso negado" });
        }
        if (cartItem.product.stock < quantity) {
            return res.status(400).json({ message: `Estoque insuficiente para ${cartItem.product.name}. Disponível: ${cartItem.product.stock}` });
        }
        const updatedCartItem = await client_js_1.default.cartItem.update({
            where: { id: cartItemId },
            data: { quantity }
        });
        res.status(200).json({ message: "Quantidade atualizada", updatedCartItem });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao atualizar item" });
    }
});
// DELETE /cart/remove/:cartItemId
router.delete("/remove/:cartItemId", verifyToken, async (req, res) => {
    const { cartItemId } = req.params;
    const userId = req.userId;
    try {
        const cartItem = await client_js_1.default.cartItem.findUnique({
            where: { id: cartItemId },
            include: { cart: true }
        });
        if (!cartItem) {
            return res.status(404).json({ message: "Item não encontrado" });
        }
        if (cartItem.cart.userId !== userId && req.userRole !== client_1.Role.ADMIN) {
            return res.status(403).json({ message: "Acesso negado" });
        }
        await client_js_1.default.cartItem.delete({ where: { id: cartItemId } });
        res.status(200).json({ message: "Item removido do carrinho" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao remover item" });
    }
});
// POST /cart/checkout
router.post("/checkout", verifyToken, async (req, res) => {
    const userId = req.userId;
    try {
        const cart = await client_js_1.default.cart.findUnique({ where: { userId } });
        if (!cart) {
            return res.status(404).json({ message: "Carrinho não encontrado" });
        }
        await client_js_1.default.cartItem.deleteMany({ where: { cartId: cart.id } });
        res.status(200).json({ message: "Compra finalizada com sucesso!" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao finalizar a compra" });
    }
});
exports.default = router;
