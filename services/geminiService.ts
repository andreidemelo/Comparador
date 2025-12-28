
import { GoogleGenAI, Type } from "@google/genai";
import { Product, ComparisonResult } from "../types";

export const comparePricesWithAI = async (
  products: Product[],
  location: string = "Brasil"
): Promise<{ results: ComparisonResult[]; sources: any[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const productListStr = products
    .map((p) => `${p.quantity}x ${p.name}`)
    .join(", ");

  const prompt = `
    Você é um assistente de comparação de preços de supermercados no Brasil.
    Localização atual: ${location}
    Produtos na lista: ${productListStr}

    Tarefa: Pesquise os preços atuais desses produtos nos principais supermercados brasileiros (ex: Carrefour, Pão de Açúcar, Extra, Assaí, Atacadão, Mercado Livre Supermercado).
    
    Por favor, retorne uma comparação detalhada em formato JSON. 
    Calcule o valor total da cesta em pelo menos 3 lojas diferentes.
    Se não encontrar o preço exato, use uma estimativa baseada em dados recentes do mercado.

    O JSON deve seguir esta estrutura:
    [
      {
        "storeName": "Nome da Loja",
        "totalPrice": 150.50,
        "items": [
          { "productName": "Arroz 5kg", "price": 25.90 },
          { "productName": "Feijão 1kg", "price": 8.50 }
        ]
      }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "[]";
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    let results: ComparisonResult[] = JSON.parse(text);
    
    // Sort and mark the cheapest
    if (results.length > 0) {
      results.sort((a, b) => a.totalPrice - b.totalPrice);
      results[0].isCheapest = true;
    }

    return { results, sources };
  } catch (error) {
    console.error("Erro na comparação de preços:", error);
    throw error;
  }
};
