import{G as x}from"./index-CqjuVzrR.js";async function w(a,s,c,n={}){const{model:i="flash",aspectRatio:t="16:9",enableGrounding:g=!0}=n;try{const e=new x({apiKey:c}),o=i==="pro"?"gemini-3-pro-image-preview":"gemini-2.5-flash-image",m=`Educational diagram: ${s}.
Style: Clean, simple, colorful illustration suitable for learning.
Clear labels, easy to understand, professional educational design.
Make it visually engaging and scientifically accurate.`;console.log(`Generating image with ${o}:`,m);const r={model:o,contents:m};(t||i==="pro")&&(r.config={responseModalities:["image"]},t&&(r.config.imageGenerationConfig={aspectRatio:t})),g&&i==="pro"&&(r.tools=[{googleSearch:{}}]);const f=await e.models.generateContent(r);if(f.candidates&&f.candidates[0]){const p=f.candidates[0].content?.parts;if(p)for(const l of p){if(l.inlineData){const u=l.inlineData.data,h=`data:${l.inlineData.mimeType||"image/png"};base64,${u}`;return console.log(`✅ Image generated successfully for "${a.title}" using ${o}`),h}l.text&&console.log("Model reasoning:",l.text)}}return console.warn("⚠️ No image in response, using fallback"),d(a.title,s)}catch(e){return console.error("❌ Failed to generate image with Gemini API:",e),e instanceof Error&&console.error("Error details:",{message:e.message,name:e.name,stack:e.stack}),d(a.title,s)}}function d(a,s){const c=s.split(" ").slice(0,30),n=[];let i="";c.forEach(e=>{(i+e).length>40?(n.push(i.trim()),i=e+" "):i+=e+" "}),i&&n.push(i.trim());const t=200+n.length*25,g=`
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="${t}" viewBox="0 0 800 ${t}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:rgb(99,102,241);stop-opacity:0.1" />
          <stop offset="100%" style="stop-color:rgb(168,85,247);stop-opacity:0.1" />
        </linearGradient>
      </defs>
      
      <rect width="800" height="${t}" fill="url(#bg)" rx="12"/>
      <rect width="800" height="${t}" fill="none" stroke="rgba(99,102,241,0.3)" stroke-width="2" rx="12"/>
      
      <text x="400" y="40" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" fill="#6366f1" text-anchor="middle">
        ${y(a)}
      </text>
      
      <text x="400" y="80" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">
        Visual Concept
      </text>
      
      ${n.map((e,o)=>`
        <text x="400" y="${120+o*25}" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#334155" text-anchor="middle">
          ${y(e)}
        </text>
      `).join("")}
      
      <circle cx="100" cy="${t-50}" r="30" fill="rgba(99,102,241,0.2)"/>
      <circle cx="700" cy="${t-50}" r="30" fill="rgba(168,85,247,0.2)"/>
      
      <text x="400" y="${t-20}" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle" font-style="italic">
        Fallback visualization (API unavailable)
      </text>
    </svg>
  `.trim();return`data:image/svg+xml;base64,${btoa(g)}`}function y(a){return a.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}export{w as generateLessonVisual};
