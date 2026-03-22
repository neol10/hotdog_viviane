const SUPABASE_URL = 'https://mnygtmcwgkrkqluaqyfe.supabase.co';
const SERVICE_KEY = 'sb_publishable_Uj4W02FU_mmn4zA86JTukw_vbzRyMqR'; // Usando anon por enquanto ou eu preciso do service_role_key. Wait, eu só tenho anon key. 

async function run() {
    try {
        console.log("Logando...");
        const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_KEY,
            },
            body: JSON.stringify({ email: 'adminhotdogviviane@gmail.com', password: 'Admin166480*-' })
        });
        const loginData = await loginRes.json();
        
        if (!loginRes.ok) throw new Error(loginData.msg || loginData.error_description || "Login failed");
        
        const token = loginData.access_token;
        console.log("Logado! Token capturado.");

        console.log("Tentando criar o Bucket...");
        const createBucketRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': SERVICE_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: 'product-images',
                name: 'product-images',
                public: true
            })
        });

        const bucketData = await createBucketRes.json();
        console.log("Create Bucket:", createBucketRes.status, bucketData);

        console.log("Testando Upload...");
        const fileContent = "This is a test image content";
        const fileName = `test_${Date.now()}.txt`;

        const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${fileName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': SERVICE_KEY,
                'Content-Type': 'text/plain',
                'x-upsert': 'true'
            },
            body: fileContent
        });

        const uploadData = await uploadRes.json();
        console.log("Upload:", uploadRes.status, uploadData);
        
    } catch (e) {
        console.error("Exceção:", e);
    }
}
run();
