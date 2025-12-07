import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { InsightResult } from "../types";

// Note: In a real production app, ensure this is handled via a secure backend proxy or carefully managed environment variables.
// For this demo, we assume process.env.API_KEY is available.
const apiKey = process.env.API_KEY || ''; 

const genAI = new GoogleGenerativeAI(apiKey);

export const generatePipelineInsights = async (
  pipelineName: string, 
  source: string, 
  destination: string,
  rowCount: number
): Promise<InsightResult[]> => {
  if (!apiKey) {
    return [
      {
        title: "API Key Missing",
        description: "Please configure your Gemini API key to see AI-driven insights about your data.",
        severity: "warning"
      }
    ];
  }

  try {
    const prompt = `
      I am an ETL engineer using a tool called ResidencyFlow.
      I have a pipeline named "${pipelineName}" moving data from ${source} to ${destination}.
      It just processed ${rowCount} rows.
      The focus is on cost efficiency and data residency compliance (GDPR/African Data Protection).
      
      Generate 3 brief insights/suggestions in JSON format.
      1. A compliance check insight.
      2. A performance/cost optimization insight (DuckDB/dlt specific).
      3. An analytics question I could answer with this data.
      
      Output Schema:
      Array of objects: { title: string, description: string, sqlQuery: string (optional), severity: 'info'|'warning'|'positive' }
    `;

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              title: { type: SchemaType.STRING },
              description: { type: SchemaType.STRING },
              sqlQuery: { type: SchemaType.STRING },
              severity: { type: SchemaType.STRING, enum: ['info', 'warning', 'positive'] }
            }
          }
        }
      }
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as InsightResult[];

  } catch (error) {
    console.error("Gemini Error:", error);
    return [
      {
        title: "AI Service Unavailable",
        description: "Could not generate insights at this moment.",
        severity: "warning"
      },
      {
        title: "Static Insight: Data Locality",
        description: "Your data is currently pinned to the local region, ensuring compliance with local data protection laws.",
        severity: "positive"
      }
    ];
  }
};

export const generateSqlTransformation = async (naturalLanguageRequest: string, schemaDescription: string): Promise<string> => {
    if (!apiKey) return "-- API Key missing\nSELECT * FROM table;";

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`You are a SQL expert for DuckDB.
            User Request: ${naturalLanguageRequest}
            Table Schema Context: ${schemaDescription}
            
            Write only the SQL query. No markdown formatting.`);
        return result.response.text() || "-- No SQL generated";
    } catch (e) {
        return "-- Error generating SQL";
    }
}
