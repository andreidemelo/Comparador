
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product, ComparisonResult, StorePrice, UserCredentials } from './types';
import { comparePricesWithAI } from './services/geminiService';
import { authService } from './services/authService';
import { Button } from './components/Button';

interface SavedList {
  id: string;
  date: string;
  userName: string;
  location: string;
  items: Product[];
  results: ComparisonResult[];
  bestPossibleTotal: number;
}

const PRODUCT_STRUCTURE: Record<string, string[]> = {
  "Arroz": ["Tio João 5Kg", "Camil 5kg", "Prato Fino 5kg", "Branco Comum 5kg", "Integral 1kg"],
  "Feijão": ["Broto Legal 1Kg", "Camil 1Kg", "Kicaldo 1kg", "Carioca 1kg", "Preto 1kg"],
  "Leite": ["Italac Integral 1L", "Piracanjuba Integral 1L", "Ninho Integral 1L", "Desnatado 1L", "Semidesnatado 1L"],
  "Café": ["Pilão 500g", "Melitta 500g", "Três Corações 500g", "Gourmet 250g"],
  "Açúcar": ["União Refinado 1kg", "Caravelas 1kg", "Cristal 1kg", "Demerara 1kg"],
  "Óleo e Azeite": ["Liza Soja 900ml", "Soya Soja 900ml", "Gallo Azeite 500ml", "Andorinha Azeite 500ml"],
  "Massas e Molhos": ["Barilla Espaguete 500g", "Adria Espaguete 500g", "Elefante Extrato 310g", "Pomarola Molho 340g"],
  "Limpeza": ["Omo Sabão em Pó 1kg", "Ipê Detergente 500ml", "Comfort Amaciante 2L", "Neve Papel Higiênico (12 un)"],
  "Higiene": ["Dove Sabonete 90g", "Colgate Creme Dental 90g", "Pantene Shampoo 400ml", "Rexona Desodorante"],
  "Bebidas": ["Coca-Cola 2L", "Guaraná Antarctica 2L", "Del Valle Laranja 1L", "Heineken Lata 350ml"]
};

const MARKET_LOGOS: Record<string, string> = {
  'carrefour': 'https://www.google.com/s2/favicons?domain=carrefour.com.br&sz=64',
  'pão de açúcar': 'https://www.google.com/s2/favicons?domain=paodeacucar.com&sz=64',
  'extra': 'https://www.google.com/s2/favicons?domain=clubeextra.com.br&sz=64',
  'assai': 'https://www.google.com/s2/favicons?domain=assai.com.br&sz=64',
  'atacadão': 'https://www.google.com/s2/favicons?domain=atacadao.com.br&sz=64',
  'mercado livre': 'https://www.google.com/s2/favicons?domain=mercadolivre.com.br&sz=64',
};

const getMarketLogo = (name: string) => {
  const lowerName = name.toLowerCase();
  for (const key in MARKET_LOGOS) {
    if (lowerName.includes(key)) return MARKET_LOGOS[key];
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=10b981&color=fff&size=64`;
};

const App: React.FC = () => {
  // Auth State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [userName, setUserName] = useState('');
  const [credentials, setCredentials] = useState<UserCredentials>({ name: '', password: '' });
  const [authFeedback, setAuthFeedback] = useState({ message: '', type: 'error' as 'error' | 'success' });

  // App State
  const [list, setList] = useState<Product[]>([]);
  const [savedLists, setSavedLists] = useState<SavedList[]>([]);
  const [results, setResults] = useState<ComparisonResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<string>("São Paulo, SP");
  
  // UI Selection State
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isBrandOpen, setIsBrandOpen] = useState(false);
  const [newItemQty, setNewItemQty] = useState(1);
  const [showSavedToast, setShowSavedToast] = useState(false);

  const categoryRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check session
    const session = authService.getCurrentSession();
    if (session) {
      setUserName(session.name);
      setIsLoggedIn(true);
    }

    // Load History
    const history = localStorage.getItem('supercompare_history');
    if (history) setSavedLists(JSON.parse(history));

    const handleClickOutside = (event: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) setIsCategoryOpen(false);
      if (brandRef.current && !brandRef.current.contains(event.target as Node)) setIsBrandOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthFeedback({ message: '', type: 'error' });

    if (authMode === 'register') {
      const res = authService.register(credentials);
      if (res.success) {
        setAuthFeedback({ message: res.message, type: 'success' });
        setTimeout(() => setAuthMode('login'), 1500);
      } else {
        setAuthFeedback({ message: res.message, type: 'error' });
      }
    } else {
      const res = authService.login(credentials);
      if (res.success) {
        setUserName(res.user!);
        setIsLoggedIn(true);
      } else {
        setAuthFeedback({ message: res.message, type: 'error' });
      }
    }
  };

  const handleLogout = () => {
    authService.logout();
    setIsLoggedIn(false);
    setUserName('');
  };

  const addItem = () => {
    if (selectedCategory && selectedBrand) {
      const newItem: Product = {
        id: Math.random().toString(36).substr(2, 9),
        name: selectedBrand,
        category: selectedCategory,
        quantity: newItemQty
      };
      setList([...list, newItem]);
      setSelectedBrand(null);
      setNewItemQty(1);
      setResults(null);
    }
  };

  const removeItem = (id: string) => {
    setList(list.filter(p => p.id !== id));
    setResults(null);
  };

  const handleCompare = async () => {
    if (list.length === 0) return;
    setLoading(true);
    try {
      const { results: apiResults } = await comparePricesWithAI(list, location);
      setResults(apiResults);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Calculations
  const marketTotals = useMemo(() => {
    if (!results) return {};
    const totals: Record<string, number> = {};
    results.forEach(res => {
      totals[res.storeName] = list.reduce((sum, item) => {
        const found = res.items.find(pi => pi.productName.toLowerCase().includes(item.name.toLowerCase()));
        const price = found ? found.price : (res.totalPrice / list.length);
        return sum + (price * item.quantity);
      }, 0);
    });
    return totals;
  }, [results, list]);

  const bestPossibleTotal = useMemo(() => {
    if (!results) return 0;
    return list.reduce((acc, item) => {
      let minItemPrice = Infinity;
      results.forEach(res => {
        const found = res.items.find(pi => pi.productName.toLowerCase().includes(item.name.toLowerCase()));
        const price = found ? found.price : (res.totalPrice / list.length);
        if (price < minItemPrice) minItemPrice = price;
      });
      return acc + (minItemPrice * item.quantity);
    }, 0);
  }, [results, list]);

  const handleSaveList = () => {
    if (!results) return;
    const newList: SavedList = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString('pt-BR'),
      userName,
      location,
      items: [...list],
      results: [...results],
      bestPossibleTotal
    };
    const updated = [newList, ...savedLists];
    setSavedLists(updated);
    localStorage.setItem('supercompare_history', JSON.stringify(updated));
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  const handlePrintRoute = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !results) return;

    const itemsByStore: Record<string, {name: string, qty: number}[]> = {};
    list.forEach(item => {
      let minPrice = Infinity;
      let store = '';
      results.forEach(res => {
        const found = res.items.find(pi => pi.productName.toLowerCase().includes(item.name.toLowerCase()));
        const price = found ? found.price : (res.totalPrice / list.length);
        if (price < minPrice) { minPrice = price; store = res.storeName; }
      });
      if (!itemsByStore[store]) itemsByStore[store] = [];
      itemsByStore[store].push({ name: item.name, qty: item.quantity });
    });

    let content = `<div style="font-family:sans-serif;padding:40px;"><h1>Roteiro de Compras: Economia Máxima</h1>`;
    Object.entries(itemsByStore).forEach(([store, items]) => {
      content += `<h3>🛒 ${store}</h3><ul>` + items.map(i => `<li>${i.qty}x ${i.name}</li>`).join('') + `</ul>`;
    });
    content += `<h2>Total do Carrinho: R$ ${bestPossibleTotal.toFixed(2)}</h2></div>`;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-emerald-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in fade-in zoom-in duration-300">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <h1 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">SuperCompare</h1>
            <p className="text-gray-400 text-xs font-bold uppercase mt-1">Sua conta segura</p>
          </div>
          
          <div className="flex p-1 bg-gray-50 rounded-xl mb-6">
            <button 
              onClick={() => {setAuthMode('login'); setAuthFeedback({message:'', type:'error'});}}
              className={`flex-1 py-2 text-xs font-black uppercase rounded-lg transition-all ${authMode === 'login' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-400'}`}
            >
              Entrar
            </button>
            <button 
              onClick={() => {setAuthMode('register'); setAuthFeedback({message:'', type:'error'});}}
              className={`flex-1 py-2 text-xs font-black uppercase rounded-lg transition-all ${authMode === 'register' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-400'}`}
            >
              Criar Conta
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <input 
              type="text" 
              placeholder="Nome de Usuário" 
              className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
              value={credentials.name} 
              onChange={e => setCredentials({...credentials, name: e.target.value})} 
              required 
            />
            <input 
              type="password" 
              placeholder="Senha" 
              className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
              value={credentials.password} 
              onChange={e => setCredentials({...credentials, password: e.target.value})} 
              required 
            />
            
            {authFeedback.message && (
              <p className={`text-xs font-bold text-center ${authFeedback.type === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
                {authFeedback.message}
              </p>
            )}

            <Button type="submit" className="w-full py-4 font-black uppercase tracking-widest">
              {authMode === 'login' ? 'Acessar App' : 'Confirmar Cadastro'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-emerald-600 text-white p-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-black uppercase tracking-tighter flex items-center">
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            SuperCompare
          </h1>
          <div className="text-right flex items-center gap-4">
            <div className="hidden sm:block">
              <p className="text-[10px] font-black uppercase opacity-70 leading-none">Bem-vindo,</p>
              <p className="text-sm font-bold">{userName}</p>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-emerald-700 rounded-lg transition-colors" title="Sair">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto p-4 md:p-8 space-y-8 flex-1">
        <section className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-8">
          <h2 className="text-sm font-black uppercase text-gray-400 tracking-widest mb-6">Criar Lista de Compras</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-1 relative" ref={categoryRef}>
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">1. Categoria</label>
              <button onClick={() => setIsCategoryOpen(!isCategoryOpen)} className="w-full text-left p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold truncate">
                {selectedCategory || "Selecionar..."}
              </button>
              {isCategoryOpen && (
                <div className="absolute z-40 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                  {Object.keys(PRODUCT_STRUCTURE).map(cat => (
                    <button key={cat} onClick={() => { setSelectedCategory(cat); setSelectedBrand(null); setIsCategoryOpen(false); setIsBrandOpen(true); }} className="w-full text-left px-4 py-2 text-sm hover:bg-emerald-50 font-medium">{cat}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="md:col-span-2 relative" ref={brandRef}>
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">2. Produto / Marca</label>
              <button onClick={() => selectedCategory && setIsBrandOpen(!isBrandOpen)} disabled={!selectedCategory} className="w-full text-left p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold truncate disabled:opacity-50">
                {selectedBrand || (selectedCategory ? "Escolher produto..." : "Selecione a categoria")}
              </button>
              {isBrandOpen && selectedCategory && (
                <div className="absolute z-40 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                  {PRODUCT_STRUCTURE[selectedCategory].map(brand => (
                    <button key={brand} onClick={() => { setSelectedBrand(brand); setIsBrandOpen(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-emerald-50 font-medium">{brand}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <div className="w-20">
                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Qtd</label>
                <input type="number" min="1" value={newItemQty} onChange={e => setNewItemQty(Number(e.target.value))} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none" />
              </div>
              <Button onClick={addItem} disabled={!selectedBrand} className="flex-1 py-3 text-xs uppercase font-black">Add</Button>
            </div>
          </div>

          <div className="mt-8 space-y-2">
            {list.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl group transition-all hover:bg-white hover:shadow-md border border-transparent hover:border-emerald-100">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center text-[10px] font-black">{item.quantity}</span>
                  <span className="text-sm font-bold text-gray-700">{item.name}</span>
                </div>
                <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-500 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
              </div>
            ))}
          </div>

          {list.length > 0 && (
            <div className="mt-10 flex justify-center">
              <Button onClick={handleCompare} isLoading={loading} className="w-full md:w-auto min-w-[240px] py-4 uppercase font-black tracking-widest shadow-xl shadow-emerald-50">Comparar Preços</Button>
            </div>
          )}
        </section>

        {results && !loading && (
          <section className="space-y-6 animate-in slide-in-from-bottom duration-500">
            <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100">
                      <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Produto</th>
                      {results.map(r => (
                        <th key={r.storeName} className="p-5 text-center border-l border-gray-100 min-w-[120px]">
                          <img src={getMarketLogo(r.storeName)} alt={r.storeName} className="w-8 h-8 mx-auto mb-2 object-contain rounded shadow-sm bg-white p-1" />
                          <span className="text-[10px] font-black uppercase text-gray-800">{r.storeName}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(item => {
                      const itemPrices = results.map(r => r.items.find(pi => pi.productName.toLowerCase().includes(item.name.toLowerCase()))?.price || (r.totalPrice / list.length));
                      const itemMinPrice = Math.min(...itemPrices);
                      return (
                        <tr key={item.id} className="border-b border-gray-50 group transition-colors hover:bg-gray-50/30">
                          <td className="p-5 text-xs font-bold text-gray-700">{item.name}</td>
                          {results.map(r => {
                            const found = r.items.find(pi => pi.productName.toLowerCase().includes(item.name.toLowerCase()));
                            const price = found ? found.price : (r.totalPrice / list.length);
                            const isBest = price === itemMinPrice;
                            return (
                              <td key={r.storeName} className="p-5 text-center border-l border-gray-50">
                                <span className={`text-xs font-mono font-black px-2 py-1 rounded-full ${isBest ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'text-gray-400 bg-gray-50'}`}>R$ {price.toFixed(2)}</span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    <tr className="bg-emerald-50/50">
                      <td className="p-5 text-[10px] font-black uppercase text-emerald-800">TOTAL POR MERCADO</td>
                      {results.map(r => {
                        const total = marketTotals[r.storeName];
                        const isGlobalWinner = total === Math.min(...Object.values(marketTotals));
                        return (
                          <td key={r.storeName} className={`p-5 text-center border-l border-emerald-100 ${isGlobalWinner ? 'bg-emerald-100/40' : ''}`}>
                            <div className="text-sm font-mono font-black text-emerald-700">R$ {total.toFixed(2)}</div>
                            {isGlobalWinner && <span className="text-[8px] font-black uppercase text-emerald-600">Melhor Loja</span>}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="bg-emerald-600 text-white">
                      <td className="p-6">
                        <div className="text-[10px] font-black uppercase opacity-70">MAX ECONOMIA</div>
                        <div className="text-xs font-bold">Mix de Lojas</div>
                      </td>
                      <td colSpan={results.length} className="p-6 text-center border-l border-emerald-700/30">
                        <div className="flex items-center justify-center gap-4">
                           <div className="text-3xl font-mono font-black">R$ {bestPossibleTotal.toFixed(2)}</div>
                           <div className="text-left leading-tight hidden sm:block">
                              <p className="text-[10px] font-black uppercase opacity-70">Economia Máxima de</p>
                              <p className="text-sm font-bold">R$ {(Math.max(...Object.values(marketTotals)) - bestPossibleTotal).toFixed(2)}</p>
                           </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-4">
               <Button onClick={handlePrintRoute} variant="secondary" className="px-8 py-4 text-xs font-black uppercase tracking-widest shadow-xl">Imprimir Roteiro</Button>
               <Button onClick={handleSaveList} className="px-8 py-4 text-xs font-black uppercase tracking-widest shadow-xl">Salvar Lista</Button>
            </div>
          </section>
        )}

        {savedLists.length > 0 && (
          <section className="pt-8">
             <h3 className="text-sm font-black uppercase text-gray-400 tracking-widest mb-6">Listas Anteriores</h3>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {savedLists.map(saved => (
                  <div key={saved.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
                    <div className="flex justify-between items-start mb-4">
                       <div>
                          <p className="text-[9px] font-black text-gray-300 uppercase leading-none mb-1">{saved.date}</p>
                          <p className="text-sm font-black text-gray-800 uppercase tracking-tighter">{saved.userName}</p>
                       </div>
                       <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{saved.location}</span>
                    </div>
                    <div className="text-2xl font-mono font-black text-emerald-600 mb-4">R$ {saved.bestPossibleTotal.toFixed(2)}</div>
                    <Button onClick={() => { setList(saved.items); setResults(saved.results); window.scrollTo({top: 0, behavior: 'smooth'}); }} variant="ghost" className="w-full text-[10px] font-black uppercase tracking-widest border border-gray-50 group-hover:border-emerald-100 group-hover:bg-emerald-50">Revisar</Button>
                  </div>
                ))}
             </div>
          </section>
        )}
      </main>

      {showSavedToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-emerald-900 text-white px-8 py-4 rounded-full shadow-2xl z-50 animate-bounce">
          <span className="text-xs font-black uppercase tracking-widest">Lista Salva com Sucesso!</span>
        </div>
      )}
    </div>
  );
};

export default App;
