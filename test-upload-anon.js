const SUPABASE_URL = 'https://mnygtmcwgkrkqluaqyfe.supabase.co';
const ANON_KEY = 'sb_publishable_Uj4W02FU_mmn4zA86JTukw_vbzRyMqR'; 

async function run() {
    try {
        console.log("Testando Upload como ANON...");
        const fileContent = "This is a test image content";
        const fileName = `test_anon_${Date.now()}.png`;

        const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${fileName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ANON_KEY}`,
                'apikey': ANON_KEY,
                'Content-Type': 'image/png',
                'x-upsert': 'true'
            },
            body: fileContent
        });

        const uploadData = await uploadRes.json();
        console.log("Upload HTTP Status:", uploadRes.status);
        console.log("Upload Data:", uploadData);
        
    } catch (e) {
        console.error("Exceção:", e);
    }
}
run();
