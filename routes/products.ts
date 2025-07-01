import { Role } from '@prisma/client';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from "jsonwebtoken";
import prisma from '../prisma/client.js';

const router = Router();

interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: Role;
}

// Middleware de autenticação
const verifyToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = req.headers['x-access-token'];

  if (!token) {
    return res.status(403).json({ message: "Token não fornecido" });
  }

  try {
    const decoded = jwt.verify(token as string, process.env.JWT_KEY as string) as { userId: string, userRole: Role };
    req.userId = decoded.userId;
    req.userRole = decoded.userRole;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido" });
  }
};

// Middleware de verificação de admin
const verifyAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.userRole !== Role.ADMIN) {
    return res.status(403).json({ message: "Acesso negado: requer administrador" });
  }
  next();
};

// Schemas Zod
const productSchema = z.object({
  name: z.string().min(3, { message: "Nome deve ter no mínimo 3 caracteres" }),
  description: z.string().min(10).optional().nullable(),
  price: z.number().positive({ message: "Preço deve ser positivo" }),
  imageUrl: z.string().url().optional().nullable(),
  category: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  stock: z.number().int().min(0).optional().default(0),
});

const productUpdateSchema = z.object({
  name: z.string().min(3).optional(),
  description: z.string().min(10).optional().nullable(),
  price: z.number().positive().optional(),
  imageUrl: z.string().url().optional().nullable(),
  category: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  stock: z.number().int().min(0).optional(),
});

// GET /products
router.get("/", async (_req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany();
    res.status(200).json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar produtos" });
  }
});

// GET /products/:id
router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: "Produto não encontrado" });
    }
    res.status(200).json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar produto" });
  }
});

// POST /products (admin)
router.post("/", verifyToken, verifyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const validation = productSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.issues });
  }

  try {
    const product = await prisma.product.create({ data: validation.data });
    res.status(201).json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao criar produto" });
  }
});

// PUT /products/:id (admin)
router.put("/:id", verifyToken, verifyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const validation = productUpdateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.issues });
  }

  try {
    const product = await prisma.product.update({
      where: { id },
      data: validation.data
    });
    res.status(200).json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar produto" });
  }
});

// DELETE /products/:id (admin)
router.delete("/:id", verifyToken, verifyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const deleted = await prisma.product.delete({ where: { id } });
    res.status(200).json({ message: `Produto '${deleted.name}' deletado.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao deletar produto" });
  }
});

// GET /products/search/:term
router.get("/search/:term", async (req: Request, res: Response) => {
  const { term } = req.params;

  try {
    const products = await prisma.product.findMany({
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro na busca" });
  }
});

export default router;
