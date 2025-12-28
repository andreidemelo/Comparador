
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product, ComparisonResult, StorePrice } from './types';
import { comparePricesWithAI } from './services/geminiService';
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
  "Farináceos": ["Dona Benta Trigo 1kg", "Renata Trigo 1kg", "Cisne Sal 1kg"],
  "Laticínios": ["Aviação Manteiga 200g", "Qualy Margarina 500g", "Claybom Margarina 500g"],
  "Padaria": ["Wickbold Pão de Forma", "Plus Vita Pão de Forma", "Ovos Brancos (Dúzia)", "Ovos Caipira (Dúzia)"],
  "Biscoitos": ["Bono Recheado 130g", "Passatempo 130g", "Mabel Cream Cracker", "Marilan Água e Sal"],
  "Limpeza": ["Omo Sabão em Pó 1kg", "Ipê Detergente 500ml", "Comfort Amaciante 2L", "Neve Papel Higiênico (12 un)"],
  "Higiene": ["Dove Sabonete 90g", "Colgate Creme Dental 90g", "Pantene Shampoo 400ml", "Rexona Desodorante"],
  "Bebidas": ["Coca-Cola 2L", "Guaraná Antarctica 2L", "Del Valle Laranja 1L", "Heineken Lata 350ml", "Vinho Casillero del Diablo"]
};

const MARKET_LOGOS: Record<string, string> = {
  'carrefour': 'https://www.google.com/s2/favicons?domain=carrefour.com.br&sz=64',
  'pão de açúcar': 'https://www.google.com/s2/favicons?domain=paodeacucar.com&sz=64',
  'extra': 'https://www.google.com/s2/favicons?domain=clubeextra.com.br&sz=64',
  'assai': 'https://www.google.com/s2/favicons?domain=assai.com.br&sz=64',
  'atacadão': 'https://www.google.com/s2/favicons?domain=atacadao.com.br&sz=64',
  'mercado livre': 'https://www.google.com/s2/favicons?domain=mercadolivre.com.br&sz=64',
  'mambo': 'https://www.google.com/s2/favicons?domain=mambo.com.br&sz=64',
  'sonda': 'https://www.google.com/s2/favicons?domain=sonda.com.br&sz=64',
  'st marche': 'https://www.google.com/s2/favicons?domain=marche.com.br&sz=64',
};

const getMarketLogo = (name: string) => {
  const lowerName = name.toLowerCase();
  for (const key in MARKET_LOGOS) {
    if (lowerName.includes(key)) return MARKET_LOGOS[key];
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=10b981&color=fff&size=64`;
};

const App: React.FC = () => {
  // Login State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // App State
  const [userName, setUserName] = useState('');
  const [list, setList] = useState<Product[]>([]);
  const [savedLists, setSavedLists] = useState<SavedList[]>([]);
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isBrandOpen, setIsBrandOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');

  const [newItemQty, setNewItemQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ComparisonResult[] | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [location, setLocation] = useState<string>("São Paulo, SP");
  const [error, setError] = useState<string | null>(null);
  const [showSavedToast, setShowSavedToast] = useState(false);
  
  const categoryRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const history = localStorage.getItem('supercompare_history');
    if (history) {
      setSavedLists(JSON.parse(history));
    }

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => console.log("Location obtained", position.coords),
        () => console.log("User denied location access")
      );
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) {
        setIsCategoryOpen(false);
      }
      if (brandRef.current && !brandRef.current.contains(event.target as Node)) {
        setIsBrandOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginName.trim().length < 3) {
      setLoginError('Nome deve ter pelo menos 3 caracteres');
      return;
    }
    if (loginPassword.length < 4) {
      setLoginError('Senha deve ter pelo menos 4 caracteres');
      return;
    }
    setUserName(loginName);
    setIsLoggedIn(true);
    setLoginError('');
  };

  const categories = useMemo(() => Object.keys(PRODUCT_STRUCTURE).sort(), []);
  const filteredCategories = useMemo(() => 
    categories.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase())),
    [categories, categorySearch]
  );

  const brandsForCategory = useMemo(() => 
    selectedCategory ? PRODUCT_STRUCTURE[selectedCategory] : [],
    [selectedCategory]
  );
  
  const filteredBrands = useMemo(() => 
    brandsForCategory.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase())),
    [brandsForCategory, brandSearch]
  );

  const bestPossibleTotal = useMemo(() => {
    if (!results) return 0;
    return list.reduce((acc, item) => {
      let minItemPrice = Infinity;
      results.forEach(res => {
        const found = res.items.find(pi => 
          pi.productName.toLowerCase().includes(item.name.toLowerCase()) || 
          item.name.toLowerCase().includes(pi.productName.toLowerCase())
        );
        const price = found ? found.price : (res.totalPrice / list.length);
        if (price < minItemPrice) minItemPrice = price;
      });
      return acc + (minItemPrice * item.quantity);
    }, 0);
  }, [results, list]);

  const marketTotals = useMemo(() => {
    if (!results) return {};
    const totals: Record<string, number> = {};
    results.forEach(res => {
      const total = list.reduce((sum, listItem) => {
        const found = res.items.find(pi => 
          pi.productName.toLowerCase().includes(listItem.name.toLowerCase()) || 
          listItem.name.toLowerCase().includes(pi.productName.toLowerCase())
        );
        const unitPrice = found ? found.price : (res.totalPrice / list.length);
        return sum + (unitPrice * listItem.quantity);
      }, 0);
      totals[res.storeName] = total;
    });
    return totals;
  }, [results, list]);

  const averageTotal = useMemo(() => {
    if (!results || results.length === 0 || list.length === 0) return 0;
    const totals = Object.values(marketTotals);
    return totals.reduce((a, b) => a + b, 0) / totals.length;
  }, [marketTotals, results, list.length]);

  const selectCategory = (cat: string) => {
    setSelectedCategory(cat);
    setCategorySearch(cat);
    setSelectedBrand(null);
    setBrandSearch('');
    setIsCategoryOpen(false);
    setIsBrandOpen(true);
  };

  const selectBrand = (brand: string) => {
    setSelectedBrand(brand);
    setBrandSearch(brand);
    setIsBrandOpen(false);
  };

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory || !selectedBrand) return;
    
    const fullName = `${selectedCategory} ${selectedBrand}`;
    const newItem: Product = {
      id: Math.random().toString(36).substr(2, 9),
      name: fullName,
      quantity: newItemQty,
      category: selectedCategory
    };
    
    setList(prev => [...prev, newItem]);
    setSelectedCategory(null);
    setSelectedBrand(null);
    setCategorySearch('');
    setBrandSearch('');
    setNewItemQty(1);
    setResults(null);
  };

  const removeItem = (id: string) => {
    setList(prev => prev.filter(item => item.id !== id));
    setResults(null);
  };

  const handleCompare = async () => {
    if (list.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const { results: apiResults, sources: apiSources } = await comparePricesWithAI(list, location);
      setResults(apiResults);
      setSources(apiSources);
    } catch (err) {
      setError("Não foi possível comparar os preços agora.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveList = () => {
    if (!results) return;
    
    const newList: SavedList = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      userName: userName || 'Anônimo',
      location,
      items: [...list],
      results: [...results],
      bestPossibleTotal
    };

    const updatedHistory = [newList, ...savedLists];
    setSavedLists(updatedHistory);
    localStorage.setItem('supercompare_history', JSON.stringify(updatedHistory));
    
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  const loadSavedList = (saved: SavedList) => {
    setList(saved.items);
    setResults(saved.results);
    setUserName(saved.userName);
    setLocation(saved.location);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getProductBestPrice = (productName: string) => {
    if (!results) return { price: 0, store: '' };
    let minPrice = Infinity;
    let store = '';
    results.forEach(res => {
      const item = res.items.find(pi => 
        pi.productName.toLowerCase().includes(productName.toLowerCase()) || 
        productName.toLowerCase().includes(pi.productName.toLowerCase())
      );
      const price = item ? item.price : (res.totalPrice / list.length);
      if (price < minPrice) {
        minPrice = price;
        store = res.storeName;
      }
    });
    return { price: minPrice, store };
  };

  const handlePrint = (type: 'best-market' | 'best-per-item') => {
    if (!results) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let content = '';
    if (type === 'best-market') {
      const bestMarket = results.find(r => r.isCheapest) || results[0];
      const computedTotal = marketTotals[bestMarket.storeName];
      content = `
        <div style="font-family: 'Inter', sans-serif; padding: 40px; color: #1f2937; max-width: 800px; margin: auto;">
          <h1 style="color: #059669; text-align: center;">Minha Lista: ${bestMarket.storeName}</h1>
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            ${list.map(item => {
              const found = bestMarket.items.find(pi => pi.productName.toLowerCase().includes(item.name.toLowerCase()));
              const price = found ? found.price : (bestMarket.totalPrice / list.length);
              return `<tr><td>${item.quantity}x ${item.name}</td><td style="text-align: right;">R$ ${(price * item.quantity).toFixed(2)}</td></tr>`;
            }).join('')}
            <tr style="font-weight: bold; font-size: 18px;"><td style="padding-top: 20px;">TOTAL</td><td style="text-align: right; padding-top: 20px;">R$ ${computedTotal.toFixed(2)}</td></tr>
          </table>
        </div>
      `;
    } else {
      const itemsByStore: Record<string, {name: string, quantity: number, price: number}[]> = {};
      list.forEach(item => {
        const best = getProductBestPrice(item.name);
        if (!itemsByStore[best.store]) itemsByStore[best.store] = [];
        itemsByStore[best.store].push({ name: item.name, quantity: item.quantity, price: best.price });
      });
      let total = 0;
      content = `<div style="font-family: 'Inter', sans-serif; padding: 40px;"><h1>Roteiro de Compras</h1>`;
      Object.entries(itemsByStore).forEach(([store, items]) => {
        const sub = items.reduce((a, b) => a + (b.price * b.quantity), 0);
        total += sub;
        content += `<h3>${store} (Subtotal: R$ ${sub.toFixed(2)})</h3><ul>` + items.map(i => `<li>${i.quantity}x ${i.name}</li>`).join('') + `</ul>`;
      });
      content += `<h2>TOTAL: R$ ${total.toFixed(2)}</h2></div>`;
    }
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  // RENDER LOGIN
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-emerald-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
          <div className="p-8 text-center bg-emerald-50">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 text-white rounded-2xl mb-4 shadow-lg shadow-emerald-200">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <h1 className="text-2xl font-black text-emerald-900 uppercase tracking-tighter">SuperCompare</h1>
            <p className="text-emerald-600/70 text-xs font-bold uppercase tracking-widest mt-1">Economia Inteligente</p>
          </div>
          
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Seu Nome</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </span>
                <input 
                  type="text" 
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  placeholder="Como deseja ser chamado?"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Sua Senha</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </span>
                <input 
                  type="password" 
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  placeholder="Digite sua senha"
                  required
                />
              </div>
            </div>

            {loginError && (
              <div className="bg-red-50 text-red-600 text-[10px] font-bold uppercase p-3 rounded-lg text-center animate-shake">
                {loginError}
              </div>
            )}

            <Button type="submit" className="w-full py-4 text-sm font-black uppercase tracking-widest shadow-xl shadow-emerald-100 active:scale-[0.98]">
              Entrar no App
            </Button>

            <div className="text-center">
              <p className="text-[9px] text-gray-300 font-bold uppercase tracking-widest">Inicie sua economia hoje mesmo</p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // MAIN APP RENDER
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-emerald-600 text-white p-4 shadow-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            <h1 className="text-xl font-bold">SuperCompare</h1>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-[10px] bg-emerald-700 px-3 py-0.5 rounded-full mb-1">{location}</div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase opacity-80">Olá, {userName}</span>
              <button onClick={() => setIsLoggedIn(false)} className="text-[9px] font-black uppercase bg-emerald-700/50 hover:bg-emerald-800 px-2 py-0.5 rounded transition-colors">Sair</button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 space-y-6">
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-6 flex items-center">Minha Lista de Compras</h2>
          
          <form onSubmit={addItem} className="flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1 w-full relative" ref={categoryRef}>
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">1. Tipo</label>
              <div 
                className={`relative flex items-center border rounded-lg p-2.5 cursor-pointer ${isCategoryOpen ? 'ring-2 ring-emerald-500' : 'border-gray-200'}`}
                onClick={() => setIsCategoryOpen(!isCategoryOpen)}
              >
                <input
                  type="text"
                  value={categorySearch}
                  onChange={(e) => { setCategorySearch(e.target.value); setSelectedCategory(null); }}
                  placeholder="Ex: Arroz..."
                  className="w-full bg-transparent outline-none text-sm"
                  onFocus={() => setIsCategoryOpen(true)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {isCategoryOpen && (
                <div className="absolute z-30 w-full mt-1 bg-white border border-gray-100 rounded-lg shadow-2xl max-h-60 overflow-y-auto">
                  {filteredCategories.map(cat => (
                    <button key={cat} type="button" onClick={() => selectCategory(cat)} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50">{cat}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 w-full relative" ref={brandRef}>
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">2. Marca</label>
              <div 
                className={`relative flex items-center border rounded-lg p-2.5 cursor-pointer ${!selectedCategory ? 'bg-gray-50' : 'bg-white'} ${isBrandOpen ? 'ring-2 ring-emerald-500' : 'border-gray-200'}`}
                onClick={() => selectedCategory && setIsBrandOpen(!isBrandOpen)}
              >
                <input
                  type="text"
                  disabled={!selectedCategory}
                  value={brandSearch}
                  onChange={(e) => { setBrandSearch(e.target.value); setSelectedBrand(null); }}
                  placeholder="Selecione a marca..."
                  className="w-full bg-transparent outline-none text-sm"
                  onFocus={() => selectedCategory && setIsBrandOpen(true)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {isBrandOpen && selectedCategory && (
                <div className="absolute z-30 w-full mt-1 bg-white border border-gray-100 rounded-lg shadow-2xl max-h-60 overflow-y-auto">
                  {filteredBrands.map(brand => (
                    <button key={brand} type="button" onClick={() => selectBrand(brand)} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50">{brand}</button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex flex-col">
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Qtd</label>
              <div className="flex items-center border border-gray-200 rounded-lg">
                <button type="button" onClick={() => setNewItemQty(Math.max(1, newItemQty - 1))} className="px-3 py-2.5">-</button>
                <span className="w-8 text-center font-bold text-sm">{newItemQty}</span>
                <button type="button" onClick={() => setNewItemQty(newItemQty + 1)} className="px-3 py-2.5">+</button>
              </div>
            </div>
            
            <Button type="submit" disabled={!selectedCategory || !selectedBrand} className="h-[42px]">Adicionar</Button>
          </form>

          <div className="mt-8 space-y-2">
            {list.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg group">
                <div className="flex items-center">
                  <span className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded flex items-center justify-center text-[10px] font-black mr-3">{item.quantity}</span>
                  <span className="text-sm font-bold text-gray-800">{item.name}</span>
                </div>
                <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-500 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
              </div>
            ))}
          </div>

          {list.length > 0 && !results && (
            <div className="mt-10 flex justify-center">
              <Button onClick={handleCompare} isLoading={loading} className="w-full md:w-auto min-w-[240px] uppercase font-black tracking-widest">Comparar Agora</Button>
            </div>
          )}
        </section>

        {results && !loading && (
          <section className="space-y-6">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100">
                      <th className="p-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Produto</th>
                      {results.map(r => (
                        <th key={r.storeName} className="p-5 text-center border-l border-gray-100">
                          <div className="flex flex-col items-center">
                            <img src={getMarketLogo(r.storeName)} alt={r.storeName} className="w-8 h-8 mb-2 object-contain" />
                            <span className="text-[10px] font-black uppercase text-center leading-tight">{r.storeName}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((item, idx) => {
                      const { price: bestPrice } = getProductBestPrice(item.name);
                      return (
                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                          <td className="p-5 text-xs font-bold">{item.name}</td>
                          {results.map(r => {
                            const found = r.items.find(pi => pi.productName.toLowerCase().includes(item.name.toLowerCase()));
                            const price = found ? found.price : (r.totalPrice / list.length);
                            const isBest = price === bestPrice;
                            return (
                              <td key={r.storeName} className="p-5 text-center border-l border-gray-50/50">
                                <span className={`text-xs font-mono font-black px-3 py-1 rounded-full ${isBest ? 'bg-emerald-600 text-white' : 'text-gray-400 bg-gray-50'}`}>R$ {price.toFixed(2)}</span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    <tr className="bg-emerald-50/30 border-t-2 border-emerald-100">
                      <td className="p-5">
                         <div className="text-[11px] font-black uppercase text-emerald-800">TOTAL POR MERCADO</div>
                         <div className="text-[8px] text-emerald-600/60 uppercase">Economia vs Média Geral</div>
                      </td>
                      {results.map(r => {
                        const computedTotal = marketTotals[r.storeName];
                        const allMarketTotals = Object.values(marketTotals);
                        const minMarketTotal = Math.min(...allMarketTotals);
                        const isCheapestMarket = computedTotal === minMarketTotal;
                        
                        const diff = averageTotal - minMarketTotal;

                        return (
                          <td key={r.storeName} className={`p-5 text-center border-l border-emerald-100 ${isCheapestMarket ? 'bg-emerald-100/50' : ''}`}>
                            {isCheapestMarket ? (
                              <div className="flex flex-col items-center">
                                <div className="text-sm font-mono font-black text-emerald-700">+ R$ {diff.toFixed(2)}</div>
                                <span className="text-[7px] uppercase bg-emerald-600 text-white px-1.5 py-0.5 rounded-full mt-1">Economia</span>
                              </div>
                            ) : '-'}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="bg-emerald-600 text-white border-t-4 border-emerald-700">
                      <td className="p-5"><div className="text-[10px] font-black uppercase">TOTAL MIX DE LOJAS</div></td>
                      <td className="p-5 text-center font-black text-xl font-mono border-l border-emerald-700/30" colSpan={results.length}>
                        R$ {(averageTotal - bestPossibleTotal).toFixed(2)}
                        <span className="block text-[8px] uppercase opacity-70">Economia Máxima</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-4 bg-white p-6 rounded-xl shadow-md border border-gray-100">
                <Button onClick={() => handlePrint('best-per-item')} variant="primary" className="text-[10px] font-black uppercase tracking-widest">Gerar lista de compras</Button>
                <Button onClick={handleSaveList} variant="secondary" className="text-[10px] font-black uppercase tracking-widest">Salvar Lista</Button>
            </div>
          </section>
        )}

        {savedLists.length > 0 && (
          <section className="mt-12">
             <h3 className="text-xs font-black uppercase text-gray-400 tracking-widest mb-6">Histórico de Listas</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {savedLists.map((saved) => (
                 <div key={saved.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                   <div className="flex justify-between mb-4">
                     <div><p className="text-[9px] text-gray-400 font-bold mb-1">{saved.date}</p><p className="text-sm font-black uppercase">{saved.userName}</p></div>
                     <span className="text-[9px] bg-emerald-50 text-emerald-700 px-2 rounded font-black uppercase">{saved.location}</span>
                   </div>
                   <p className="text-lg font-mono font-black text-emerald-600 mb-4">R$ {saved.bestPossibleTotal.toFixed(2)}</p>
                   <button onClick={() => loadSavedList(saved)} className="w-full text-[9px] font-black uppercase py-2 bg-gray-50 hover:bg-emerald-600 hover:text-white transition-colors rounded-lg border border-gray-100">Carregar Lista</button>
                 </div>
               ))}
             </div>
          </section>
        )}
      </main>

      {showSavedToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-emerald-900 text-white px-6 py-3 rounded-full shadow-2xl z-50 animate-bounce">
          <span className="text-xs font-black uppercase tracking-widest">Lista Salva!</span>
        </div>
      )}
    </div>
  );
};

export default App;
