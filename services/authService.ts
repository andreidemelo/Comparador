
import { UserCredentials } from "../types";

const USERS_DB_KEY = 'supercompare_users_db';
const SESSION_KEY = 'supercompare_session';

export const authService = {
  // Retorna todos os usuários cadastrados
  getUsers: (): UserCredentials[] => {
    const data = localStorage.getItem(USERS_DB_KEY);
    return data ? JSON.parse(data) : [];
  },

  // Cadastra um novo usuário
  register: (credentials: UserCredentials): { success: boolean; message: string } => {
    const users = authService.getUsers();
    const exists = users.find(u => u.name.toLowerCase() === credentials.name.toLowerCase());

    if (exists) {
      return { success: false, message: "Este nome de usuário já está em uso." };
    }

    users.push(credentials);
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
    return { success: true, message: "Conta criada com sucesso!" };
  },

  // Realiza o login
  login: (credentials: UserCredentials): { success: boolean; user?: string; message: string } => {
    const users = authService.getUsers();
    const user = users.find(u => 
      u.name.toLowerCase() === credentials.name.toLowerCase() && 
      u.password === credentials.password
    );

    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ name: user.name }));
      return { success: true, user: user.name, message: "Login realizado!" };
    }

    return { success: false, message: "Usuário ou senha incorretos." };
  },

  // Verifica se há uma sessão ativa
  getCurrentSession: (): { name: string } | null => {
    const session = localStorage.getItem(SESSION_KEY);
    return session ? JSON.parse(session) : null;
  },

  // Encerra a sessão
  logout: () => {
    localStorage.removeItem(SESSION_KEY);
  }
};
