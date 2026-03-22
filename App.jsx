import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  updateDoc,
  increment,
  writeBatch
} from 'firebase/firestore';
import { 
  Plus, CheckCircle2, XCircle, RotateCcw, Trash2, 
  X, Save, Users, PieChart, MapPin, 
  UserMinus, Download, Calendar,
  Sparkles, BrainCircuit, Loader2, Mic, Megaphone,
  MessageSquare, TrendingUp, AlertTriangle, Tag, 
  BarChart3, ShoppingBasket, Volume2
} from 'lucide-react';

const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'delivery-semanal-v5';
const apiKey = ""; // Injected at runtime

const PRECIO_VIANDA_BASE = 9000;
const VALOR_DESCUENTO = 1000;
const ZONAS = ["PDA", "Banda Norte", "Banda Sur"];

export default function App() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [currentCart, setCurrentCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [activeView, setActiveView] = useState('pedidos');
  const [isExporting, setIsExporting] = useState(false);
  
  // Gemini States
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [aiInsight, setAiInsight] = useState(null);

  const [formData, setFormData] = useState({
    customerName: '',
    zone: 'PDA',
    productType: 'Vianda del día',
    quantity: '1',
    otherProductDetail: '',
    otherProductPrice: '',
    notes: '',
    paymentMethod: 'Efectivo'
  });

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const ordersCol = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
    const clientsCol = collection(db, 'artifacts', appId, 'public', 'data', 'clients');

    const unsubscribeOrders = onSnapshot(ordersCol, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(docs);
    }, (error) => console.error("Orders error:", error));

    const unsubscribeClients = onSnapshot(clientsCol, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(docs);
    }, (error) => console.error("Clients error:", error));

    return () => {
      unsubscribeOrders();
      unsubscribeClients();
    };
  }, [user]);

  // --- GEMINI API INTEGRATION ---

  const callGemini = async (prompt, systemInstruction = "") => {
    setIsAiLoading(true);
    let retries = 0;
    const maxRetries = 5;
    const delays = [1000, 2000, 4000, 8000, 16000];

    while (retries < maxRetries) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] }
          })
        });

        if (!response.ok) throw new Error('API Error');
        const result = await response.json();
        setIsAiLoading(false);
        return result.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (err) {
        retries++;
        if (retries === maxRetries) {
          setIsAiLoading(false);
          return null;
        }
        await new Promise(res => setTimeout(res, delays[retries-1]));
      }
    }
  };

  const handleAiOptimizeNotes = async () => {
    if (!formData.notes) return;
    const optimized = await callGemini(
      `Corrige y organiza esta nota de pedido de comida: "${formData.notes}". Que sea clara y profesional. Solo el texto final.`,
      "Eres un experto en logística de delivery."
    );
    if (optimized) setFormData(prev => ({ ...prev, notes: optimized.trim() }));
  };

  const handleAiSuggestMenu = async () => {
    const history = productCount.map(([name, count]) => `${name}: ${count}`).join(", ");
    const suggestion = await callGemini(
      `Basado en las ventas de esta semana: ${history || "Sin datos aún"}. Sugiere un menú creativo de 3 platos para la próxima semana en Argentina. Sé breve y usa emojis.`,
      "Eres un chef estrella especializado en viandas hogareñas."
    );
    if (suggestion) setAiSuggestion(suggestion);
  };

  const handleAiClientAnalysis = async (client) => {
    const prompt = `Analiza este cliente. Nombre: ${client.name}, Deuda: ${client.debt}, Zona: ${client.zone}. Dame un veredicto de 20 palabras sobre su riesgo crediticio.`;
    const analysis = await callGemini(prompt, "Eres un analista de riesgos para pequeños comercios.");
    if (analysis) alert(`✨ Análisis IA: ${analysis}`);
  };

  const handleGenerateMessage = async (client) => {
    const prompt = `Escribe un mensaje de WhatsApp para cobrarle a ${client.name} que debe ${formatCurrency(client.debt)}. Usa tono rioplatense (Argentina), debe ser amable pero firme.`;
    const message = await callGemini(prompt, "Eres un asistente de cobranzas muy educado.");
    if (message) {
      const encoded = encodeURIComponent(message);
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  const handleStrategicInsight = async () => {
    const summary = orders.map(o => `Zona: ${o.zone}, Pago: ${o.paymentMethod}, Total: ${o.total}`).join(" | ");
    const insight = await callGemini(
      `Analiza estos datos de ventas de hoy: ${summary}. Indica la zona más rentable y una recomendación para mejorar las ganancias hoy mismo. Máximo 30 palabras.`,
      "Eres un consultor estratégico de negocios gastronómicos."
    );
    if (insight) setAiInsight(insight);
  };

  const playAiVoice = async (text) => {
    if (!text || isSpeaking) return;
    setIsSpeaking(true);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Lee esta nota de pedido para el repartidor: ${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } }
          }
        })
      });

      const result = await response.json();
      const pcmData = result.candidates[0].content.parts[0].inlineData.data;
      
      const audioContent = atob(pcmData);
      const buffer = new Uint8Array(audioContent.length);
      for (let i = 0; i < audioContent.length; i++) {
        buffer[i] = audioContent.charCodeAt(i);
      }
      
      const blob = new Blob([buffer], { type: 'audio/l16' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => setIsSpeaking(false);
      audio.play().catch(e => {
        console.error("Playback error:", e);
        setIsSpeaking(false);
      });
    } catch (e) {
      console.error("TTS Error:", e);
      setIsSpeaking(false);
    }
  };

  // --- BUSINESS LOGIC ---

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addToCart = () => {
    const isOther = formData.productType === 'Otros';
    const productName = isOther ? (formData.otherProductDetail || 'Otro') : formData.productType;
    const unitPrice = isOther ? (parseFloat(formData.otherProductPrice) || 0) : PRECIO_VIANDA_BASE;
    const qty = parseInt(formData.quantity) || 1;

    setCurrentCart([...currentCart, {
      id: Date.now(),
      name: productName,
      quantity: qty,
      price: unitPrice * qty
    }]);
    
    setFormData(prev => ({ ...prev, productType: 'Vianda del día', quantity: '1', otherProductDetail: '', otherProductPrice: '' }));
  };

  const totalCart = useMemo(() => {
    const subtotal = currentCart.reduce((sum, item) => sum + item.price, 0);
    return Math.max(0, subtotal - discount);
  }, [currentCart, discount]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !formData.customerName || currentCart.length === 0) return;

    const orderData = {
      customerName: formData.customerName,
      zone: formData.zone,
      notes: formData.notes,
      items: currentCart,
      discount: discount,
      total: totalCart,
      paymentMethod: formData.paymentMethod,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), orderData);
      const existingClient = clients.find(c => c.name.trim().toLowerCase() === formData.customerName.trim().toLowerCase());
      const debtToAdd = formData.paymentMethod === 'Fiado' ? totalCart : 0;

      if (existingClient) {
        const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'clients', existingClient.id);
        await updateDoc(clientRef, {
          debt: increment(debtToAdd),
          lastOrder: new Date().toISOString(),
          zone: formData.zone
        });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'clients'), {
          name: formData.customerName,
          zone: formData.zone,
          debt: debtToAdd,
          lastOrder: new Date().toISOString()
        });
      }

      setFormData({ customerName: '', zone: 'PDA', productType: 'Vianda del día', quantity: '1', otherProductDetail: '', otherProductPrice: '', notes: '', paymentMethod: 'Efectivo' });
      setCurrentCart([]);
      setDiscount(0);
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  const updateOrderStatus = async (id, newStatus) => {
    if (!user) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', id), { status: newStatus });
  };

  const deleteOrder = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', id));
  };

  const exportAndResetDay = async () => {
    if (orders.length === 0) return;
    setIsExporting(true);
    try {
      const headers = ["Fecha", "Cliente", "Zona", "Total", "Estado"];
      const rows = orders.map(o => [new Date(o.createdAt).toLocaleString(), o.customerName, o.zone, o.total, o.status]);
      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_delivery_${new Date().toLocaleDateString()}.csv`;
      a.click();

      const batch = writeBatch(db);
      orders.forEach(o => batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'orders', o.id)));
      await batch.commit();
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  const resetDebt = async (clientId) => {
    if (!user) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clients', clientId), { debt: 0 });
  };

  const groupedOrders = useMemo(() => {
    const groups = {};
    ZONAS.forEach(z => groups[z] = []);
    orders.forEach(o => { if(groups[o.zone]) groups[o.zone].push(o); });
    return groups;
  }, [orders]);

  const stats = useMemo(() => {
    const s = { efectivo: 0, transf: 0, fiado: 0 };
    orders.forEach(o => {
      if (o.status !== 'canceled') {
        if (o.paymentMethod === 'Efectivo') s.efectivo += o.total;
        if (o.paymentMethod === 'Transferencia') s.transf += o.total;
        if (o.paymentMethod === 'Fiado') s.fiado += o.total;
      }
    });
    return s;
  }, [orders]);

  const productCount = useMemo(() => {
    const counts = {};
    orders.forEach(order => {
      if (order.status !== 'canceled') {
        order.items.forEach(item => {
          counts[item.name] = (counts[item.name] || 0) + (item.quantity || 1);
        });
      }
    });
    return Object.entries(counts).sort((a,b) => b[1] - a[1]);
  }, [orders]);

  const formatCurrency = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-10">
      <header className="bg-orange-600 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={22} />
            <h1 className="text-lg font-black uppercase tracking-tighter">Delivery Pro IA</h1>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex gap-1 bg-orange-700/50 p-1 rounded-xl mr-2">
              <button onClick={() => setActiveView('pedidos')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeView === 'pedidos' ? 'bg-white text-orange-600 shadow' : 'text-orange-100'}`}>PEDIDOS</button>
              <button onClick={() => setActiveView('clientes')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeView === 'clientes' ? 'bg-white text-orange-600 shadow' : 'text-orange-100'}`}>CLIENTES</button>
            </nav>
            <button 
              onClick={exportAndResetDay} 
              disabled={isExporting || orders.length === 0}
              className="bg-black text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-slate-800 disabled:opacity-30 transition-all"
            >
              <Download size={14} /> {isExporting ? '...' : 'Cerrar Día'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeView === 'pedidos' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            <div className="lg:col-span-4 space-y-6">
              {/* Form Input Section */}
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                  <Plus size={16} className="text-orange-600" /> Nuevo Pedido
                </h2>
                
                <div className="space-y-4">
                  <input type="text" name="customerName" value={formData.customerName} onChange={handleInputChange} placeholder="Cliente..." className="w-full px-4 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" />
                  
                  <div className="grid grid-cols-3 gap-1.5">
                    {ZONAS.map(z => (
                      <button key={z} onClick={() => setFormData(p => ({...p, zone: z}))} className={`py-2 text-[10px] font-black rounded-lg border transition-all ${formData.zone === z ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>{z}</button>
                    ))}
                  </div>

                  <div className="relative">
                    <textarea name="notes" value={formData.notes} onChange={handleInputChange} placeholder="Dirección y notas..." className="w-full px-4 py-2 text-sm border border-slate-200 rounded-xl h-20 resize-none outline-none focus:ring-2 focus:ring-orange-500" />
                    <div className="absolute bottom-2 right-2 flex gap-1">
                      <button onClick={handleAiOptimizeNotes} disabled={isAiLoading || !formData.notes} title="Optimizar Notas ✨" className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-orange-600 transition-all shadow-md">
                        {isAiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex gap-2 mb-2">
                      <select name="productType" value={formData.productType} onChange={handleInputChange} className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white">
                        <option value="Vianda del día">Vianda del día</option>
                        <option value="Ensalada">Ensalada</option>
                        <option value="Otros">Otros</option>
                      </select>
                      <input type="number" name="quantity" value={formData.quantity} onChange={handleInputChange} className="w-16 px-2 py-2 text-sm border border-slate-200 rounded-xl text-center font-bold" />
                    </div>
                    {formData.productType === 'Otros' && (
                      <div className="flex gap-2 mb-2">
                        <input type="text" name="otherProductDetail" value={formData.otherProductDetail} onChange={handleInputChange} placeholder="¿Qué?" className="flex-1 px-3 py-2 text-xs border border-orange-200 rounded-xl" />
                        <input type="number" name="otherProductPrice" value={formData.otherProductPrice} onChange={handleInputChange} placeholder="$" className="w-20 px-2 py-2 text-xs border border-orange-200 rounded-xl font-bold" />
                      </div>
                    )}
                    <button onClick={addToCart} className="w-full bg-slate-800 text-white text-[10px] font-black py-2 rounded-xl uppercase">Añadir</button>
                  </div>

                  {currentCart.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="flex justify-between items-center px-1 border-b border-slate-100 pb-2">
                         <span className="text-[10px] font-black text-slate-400 uppercase">Subtotal</span>
                         <span className="text-sm font-bold">{formatCurrency(currentCart.reduce((s,i)=>s+i.price,0))}</span>
                      </div>
                      
                      <button 
                         onClick={() => setDiscount(prev => prev === VALOR_DESCUENTO ? 0 : VALOR_DESCUENTO)}
                         className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${discount > 0 ? 'bg-orange-100 border-orange-300 text-orange-600' : 'bg-white border-slate-200 text-slate-400'}`}
                      >
                         <Tag size={12} /> Descuento -$1.000
                      </button>

                      <div className="flex justify-between items-center px-1 pt-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Total Final</span>
                        <span className="text-2xl font-black text-orange-600">{formatCurrency(totalCart)}</span>
                      </div>
                      <div className="flex gap-2">
                        <select name="paymentMethod" value={formData.paymentMethod} onChange={handleInputChange} className={`flex-1 px-3 py-2 text-xs font-black roun
