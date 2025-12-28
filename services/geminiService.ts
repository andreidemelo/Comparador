
import { GoogleGenAI, Type } from "@google/genai";
import { Product, ComparisonResult } from "../types";

export const comparePricesWithAI = async (
  products: Product[],
  location: string = "Brasil"
): Promise<{ results: ComparisonResult[]; sources: any[] }> => {
  // Always use process.env.API_KEY and named parameter for initialization
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const productListStr = products
    .map((p) => `${p.quantity}x ${p.name}`)
    .join(", ");

  const prompt = `
    Você é um assistente de comparação de preços de supermercados no Brasil.
    Localização atual: ${location}
    Produtos na lista: ${productListStr}

    Tarefa: Pesquise os preços atuais desses produtos nos principais supermercados brasileiros (ex: Carrefour, Pão de Açúcar, Extra, Assaí, Atacadão, Mercado Livre Supermercado).
    
    Calcule o valor total da cesta em pelo menos 3 lojas diferentes.
    Se não encontrar o preço exato, use uma estimativa baseada em dados recentes do mercado.
  `;

  try {
    // Use gemini-3-flash-preview for complex reasoning and search tasks
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        // Only googleSearch tool is allowed when using search grounding
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        // Using responseSchema to ensure valid JSON structure
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              storeName: { type: Type.STRING },
              totalPrice: { type: Type.NUMBER },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productName: { type: Type.STRING },
                    price: { type: Type.NUMBER }
                  },
                  required: ["productName", "price"]
                }
              }
            },
            required: ["storeName", "totalPrice", "items"]
          }
        }
      },
    });

    // Access .text property directly (not a method)
    const text = response.text || "[]";
    // Extract grounding chunks as required for googleSearch
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    let results: ComparisonResult[] = JSON.parse(text);
    
    // Sort and mark the cheapest
    if (Array.isArray(results) && results.length > 0) {
      results.sort((a, b) => a.totalPrice - b.totalPrice);
      results[0].isCheapest = true;
    } else {
      results = [];
    }

    return { results, sources };
  } catch (error) {
    console.error("Erro na comparação de preços:", error);
    throw error;
  }
};
