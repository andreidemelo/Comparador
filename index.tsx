
// --- ESTADO ---
let currentUser: string | null = null;
let authMode: 'login' | 'register' = 'login';
let shoppingList: any[] = [];

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    setupAdminUser();
    initData();
    checkSession();
    renderShoppingDropdowns();
});

function setupAdminUser() {
    const users = JSON.parse(localStorage.getItem('supercompare_users_db') || '[]');
    if (!users.find((u: any) => u.name === 'administrador')) {
        users.push({ 
            name: 'administrador', 
            password: 'Mu@300413', 
            email: 'admin@supercompare.com',
            city: 'Sistema',
            createdAt: new Date().toISOString() 
        });
        localStorage.setItem('supercompare_users_db', JSON.stringify(users));
    }
}

function initData() {
    if (!localStorage.getItem('supercompare_cities')) {
        localStorage.setItem('supercompare_cities', JSON.stringify([
            { name: 'São Paulo', state: 'SP' },
            { name: 'Rio de Janeiro', state: 'RJ' }
        ]));
    }
    if (!localStorage.getItem('supercompare_categories')) {
        localStorage.setItem('supercompare_categories', JSON.stringify(['Arroz', 'Feijão', 'Leite']));
    }
}

function checkSession() {
    const session = localStorage.getItem('supercompare_session');
    if (session) {
        currentUser = JSON.parse(session).name;
        enterApp();
    }
}

// --- NAVEGAÇÃO ---
const showView = (viewId: string) => {
    document.querySelectorAll('#main-app main > div').forEach(div => div.classList.add('hidden'));
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.classList.remove('hidden');
        if (viewId === 'admin-users') renderAdminUsers();
        if (viewId === 'admin-cities') renderAdminCities();
        if (viewId === 'home') renderShoppingDropdowns();
    }
};
(window as any).showView = showView;

const setAuthMode = (mode: 'login' | 'register') => {
    authMode = mode;
    const btnLogin = document.getElementById('btn-tab-login');
    const btnRegister = document.getElementById('btn-tab-register');
    const btnSubmit = document.getElementById('btn-auth-submit');
    const registerFields = document.getElementById('register-only-fields');
    const errorEl = document.getElementById('auth-error');
    const successEl = document.getElementById('auth-success');

    if (btnLogin) btnLogin.className = mode === 'login' ? "flex-1 py-2 text-xs font-black uppercase rounded-lg bg-white shadow-sm text-emerald-600" : "flex-1 py-2 text-xs font-black uppercase rounded-lg text-gray-400";
    if (btnRegister) btnRegister.className = mode === 'register' ? "flex-1 py-2 text-xs font-black uppercase rounded-lg bg-white shadow-sm text-emerald-600" : "flex-1 py-2 text-xs font-black uppercase rounded-lg text-gray-400";
    if (btnSubmit) btnSubmit.textContent = mode === 'login' ? "Acessar App" : "Confirmar Cadastro";
    
    if (registerFields) {
        registerFields.classList.toggle('hidden', mode === 'login');
        if (mode === 'register') {
            populateRegisterCities();
            // Torna os campos requeridos apenas no modo registro
            (document.getElementById('auth-email') as HTMLInputElement).required = true;
            (document.getElementById('auth-city') as HTMLSelectElement).required = true;
        } else {
            (document.getElementById('auth-email') as HTMLInputElement).required = false;
            (document.getElementById('auth-city') as HTMLSelectElement).required = false;
        }
    }

    if (errorEl) errorEl.classList.add('hidden');
    if (successEl) successEl.classList.add('hidden');
};
(window as any).setAuthMode = setAuthMode;

function populateRegisterCities() {
    const cities = JSON.parse(localStorage.getItem('supercompare_cities') || '[]');
    const select = document.getElementById('auth-city') as HTMLSelectElement;
    if (select) {
        select.innerHTML = '<option value="">Selecione sua Cidade</option>' + 
            cities.map((c: any) => `<option value="${c.name}">${c.name}</option>`).join('');
    }
}

// --- AUTENTICAÇÃO ---
const authForm = document.getElementById('form-auth');
if (authForm) {
    authForm.onsubmit = (e) => {
        e.preventDefault();
        const nameEl = document.getElementById('auth-username') as HTMLInputElement;
        const passEl = document.getElementById('auth-password') as HTMLInputElement;
        const emailEl = document.getElementById('auth-email') as HTMLInputElement;
        const cityEl = document.getElementById('auth-city') as HTMLSelectElement;
        const errorEl = document.getElementById('auth-error');
        const successEl = document.getElementById('auth-success');
        
        const name = nameEl.value.trim();
        const pass = passEl.value;
        const email = emailEl.value.trim();
        const city = cityEl.value;

        if (errorEl) errorEl.classList.add('hidden');
        if (successEl) successEl.classList.add('hidden');

        const users = JSON.parse(localStorage.getItem('supercompare_users_db') || '[]');

        if (authMode === 'register') {
            if (users.find((u: any) => u.name.toLowerCase() === name.toLowerCase())) {
                if (errorEl) {
                    errorEl.textContent = "Erro: Este usuário já existe.";
                    errorEl.classList.remove('hidden');
                }
                return;
            }
            users.push({ 
                name, 
                email,
                city,
                password: pass, 
                createdAt: new Date().toISOString() 
            });
            localStorage.setItem('supercompare_users_db', JSON.stringify(users));
            if (successEl) {
                successEl.textContent = "Sucesso! Conta criada. Agora faça login.";
                successEl.classList.remove('hidden');
            }
            setAuthMode('login');
        } else {
            const user = users.find((u: any) => u.name.toLowerCase() === name.toLowerCase() && u.password === pass);
            if (user) {
                currentUser = user.name;
                localStorage.setItem('supercompare_session', JSON.stringify({ name: user.name }));
                enterApp();
            } else {
                if (errorEl) {
                    errorEl.textContent = "Erro: Usuário ou senha incorretos";
                    errorEl.classList.remove('hidden');
                }
            }
        }
    };
}

function enterApp() {
    const authSec = document.getElementById('auth-section');
    const mainApp = document.getElementById('main-app');
    const headerName = document.getElementById('header-user-name');
    const navAdmin = document.getElementById('nav-admin');

    if (authSec) authSec.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');
    if (headerName) headerName.textContent = currentUser;
    if (navAdmin) navAdmin.classList.toggle('hidden', currentUser !== 'administrador');
    showView('home');
}

(window as any).logout = () => {
    localStorage.removeItem('supercompare_session');
    location.reload();
};

// --- ADMIN: USUÁRIOS ---
function renderAdminUsers() {
    const users = JSON.parse(localStorage.getItem('supercompare_users_db') || '[]');
    const tableBody = document.getElementById('table-admin-users');
    
    if (!tableBody) return;

    tableBody.innerHTML = users.map((u: any) => {
        const date = u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) : 'N/A';

        return `
            <tr>
                <td class="p-4">
                    <p class="font-black text-gray-800">${u.name}</p>
                </td>
                <td class="p-4">
                    <p class="text-xs text-gray-600">${u.email || 'N/A'}</p>
                </td>
                <td class="p-4">
                    <p class="text-[10px] text-emerald-600 uppercase font-black">${u.city || 'N/A'}</p>
                </td>
                <td class="p-4 text-gray-500 font-normal">${date}</td>
                <td class="p-4 font-mono text-gray-400">${u.password}</td>
                <td class="p-4 text-right">
                    ${u.name === 'administrador' ? 
                        '<span class="text-xs text-gray-400 italic">Sistema</span>' : 
                        `<button onclick="deleteUser('${u.name}')" class="text-red-500 hover:underline">Remover</button>`}
                </td>
            </tr>
        `;
    }).join('');
}

const deleteUser = (name: string) => {
    if(!confirm(`Excluir usuário "${name}" permanentemente?`)) return;
    let users = JSON.parse(localStorage.getItem('supercompare_users_db') || '[]');
    localStorage.setItem('supercompare_users_db', JSON.stringify(users.filter((u: any) => u.name !== name)));
    renderAdminUsers();
    showToast("Usuário removido");
};
(window as any).deleteUser = deleteUser;

// --- ADMIN: CIDADES ---
function renderAdminCities() {
    const cities = JSON.parse(localStorage.getItem('supercompare_cities') || '[]');
    const table = document.getElementById('table-admin-cities');
    if (table) table.innerHTML = cities.map((c: any) => `<tr><td class="p-4">${c.name}</td><td class="p-4">${c.state}</td><td class="p-4 text-right"><button onclick="deleteCity('${c.name}')" class="text-red-500">Remover</button></td></tr>`).join('');
}
const deleteCity = (name: string) => {
    let cities = JSON.parse(localStorage.getItem('supercompare_cities') || '[]');
    localStorage.setItem('supercompare_cities', JSON.stringify(cities.filter((c: any) => c.name !== name)));
    renderAdminCities();
};
(window as any).deleteCity = deleteCity;

const cityForm = document.getElementById('form-admin-city');
if (cityForm) {
    cityForm.onsubmit = (e) => {
        e.preventDefault();
        const cities = JSON.parse(localStorage.getItem('supercompare_cities') || '[]');
        cities.push({ 
            name: (document.getElementById('input-admin-city-name') as HTMLInputElement).value, 
            state: (document.getElementById('input-admin-city-state') as HTMLInputElement).value.toUpperCase() 
        });
        localStorage.setItem('supercompare_cities', JSON.stringify(cities));
        renderAdminCities();
        (e.target as HTMLFormElement).reset();
    };
}

// --- UTILITÁRIOS ---
function showToast(txt: string) {
    const t = document.getElementById('toast');
    const tx = document.getElementById('toast-text');
    if (t && tx) {
        tx.textContent = txt;
        t.classList.remove('translate-y-20');
        setTimeout(() => t.classList.add('translate-y-20'), 2000);
    }
}

function renderShoppingDropdowns() {
    const cats = JSON.parse(localStorage.getItem('supercompare_categories') || '[]');
    const selCat = document.getElementById('select-category') as HTMLSelectElement;
    if (!selCat) return;
    selCat.innerHTML = '<option value="">Categoria</option>' + cats.map((c: any) => `<option value="${c}">${c}</option>`).join('');
}

// Funções globais placeholder para não quebrar o HTML inicial
(window as any).addItem = () => {};
(window as any).runComparison = () => {};
(window as any).removeItem = () => {};
(window as any).generatePDFList = () => {};
(window as any).saveList = () => {};
