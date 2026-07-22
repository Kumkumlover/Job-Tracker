export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Global promise chain to strictly enforce sequential execution across all modules
(globalThis as any).groqQueue = (globalThis as any).groqQueue || Promise.resolve();

export async function fetchGroqSequential(url: string, options: any, retries = 3): Promise<Response> {
  return new Promise((resolve, reject) => {
    (globalThis as any).groqQueue = (globalThis as any).groqQueue.then(async () => {
      // Groq limits: 30 RPM, 6000 TPM. We wait 12000ms to guarantee we stay under TPM limits (5 requests/min * ~1000 tokens = 5000 TPM).
      await delay(12000);
      try {
        let res = await fetch(url, options);
        
        // Handle 429/503 inside the queue so it halts all other queued calls
        if ((res.status === 429 || res.status === 503) && retries > 0) {
          console.warn(`Groq Rate Limited (HTTP ${res.status}). Waiting 20s...`);
          await delay(20000);
          res = await fetch(url, options); // One direct retry after long wait
        }
        
        resolve(res);
      } catch (err) {
        reject(err);
      }
    });
  });
}
