"use client"

import { useEffect, useRef } from 'react';
import { useGlobalStore } from './GlobalStore';

// --- Tipagens para as respostas da API ---
interface UserData {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'VISITOR';
}

interface CartItemData {
    productId: string;
    quantity: number;
}

interface CartApiResponse {
    cartItems: CartItemData[];
}

export function GlobalStoreInitializer() {
    const initialized = useRef(false);
    const { user, loginUser, setCartItems } = useGlobalStore();

    // Efeito para auto-login e busca de carrinho na inicialização
    useEffect(() => {
        if (!initialized.current) {
            initialized.current = true; // Marca como inicializado imediatamente

            const storedUserId = localStorage.getItem("userId");
            const storedUserToken = localStorage.getItem("userToken");

            if (storedUserId && storedUserToken && !user.id) {
                const autoLoginAndFetchCart = async () => {
                    try {
                        // CORREÇÃO: Usando o cabeçalho de autenticação padrão "Bearer"
                        const userResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${storedUserId}`, {
                            headers: {
                                "Authorization": `Bearer ${storedUserToken}`,
                            },
                        });

                        if (userResponse.ok) {
                            const userData: UserData = await userResponse.json();
                            const userToLogin = { 
                                ...userData, 
                                token: storedUserToken,
                                createdAt: (userData as any).createdAt ?? new Date().toISOString(),
                                updatedAt: (userData as any).updatedAt ?? new Date().toISOString()
                            };
                            loginUser(userToLogin);

                            // Busca o carrinho apenas após o login bem-sucedido
                            const cartResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/cart/${userToLogin.id}`, {
                                headers: {
                                    "Authorization": `Bearer ${storedUserToken}`,
                                },
                            });

                            if (cartResponse.ok) {
                                const cartData: CartApiResponse = await cartResponse.json();
                                // CORREÇÃO: Removido 'any', usando 'CartItemData'
                                setCartItems(cartData.cartItems.map((item: CartItemData) => ({
                                    productId: item.productId,
                                    quantity: item.quantity
                                })));
                            } else {
                                console.error("Erro ao buscar carrinho no auto-login:", await cartResponse.text());
                                setCartItems([]);
                            }
                        } else {
                            // Limpa o armazenamento se o token/usuário for inválido
                            localStorage.removeItem("userId");
                            localStorage.removeItem("userToken");
                            setCartItems([]);
                        }
                    } catch (error) {
                        console.error("Erro no auto-login ou ao buscar carrinho:", error);
                        localStorage.removeItem("userId");
                        localStorage.removeItem("userToken");
                        setCartItems([]);
                    }
                };
                autoLoginAndFetchCart();
            }
        }
    }, [loginUser, setCartItems, user.id]);

    // Efeito para buscar o carrinho quando o usuário muda (login/logout manual)
    useEffect(() => {
        if (user.id && user.token) {
            const fetchCartForLoggedInUser = async () => {
                try {
                    const cartResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/cart/${user.id}`, {
                        headers: {
                            "Authorization": `Bearer ${user.token}`,
                        },
                    });
                    if (cartResponse.ok) {
                        const cartData: CartApiResponse = await cartResponse.json();
                         // CORREÇÃO: Removido 'any', usando 'CartItemData'
                        setCartItems(cartData.cartItems.map((item: CartItemData) => ({
                            productId: item.productId,
                            quantity: item.quantity
                        })));
                    } else {
                        setCartItems([]);
                    }
                } catch (error) {
                    console.error("Erro ao buscar carrinho para usuário logado:", error);
                    setCartItems([]);
                }
            };
            fetchCartForLoggedInUser();
        } else {
            // Limpa o carrinho se não houver usuário logado
            setCartItems([]);
        }
    }, [user.id, user.token, setCartItems]);

    return null; // Este componente não renderiza nada na tela
}
