// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PushPayload = {
  orderId?: string;
  shortId?: string;
  customerName?: string;
  deliveryType?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as PushPayload;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID") || "";
    const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") || "";
    const firebasePrivateKeyRaw = Deno.env.get("FIREBASE_PRIVATE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.");
    }

    if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKeyRaw) {
      throw new Error("Secrets do Firebase não configurados (PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY).");
    }

    const firebasePrivateKey = firebasePrivateKeyRaw.replace(/\\n/g, "\n");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: subscriptions, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("token")
      .eq("is_active", true)
      .in("role", ["kds", "admin"]);

    if (subsError) {
      throw new Error(`Erro buscando tokens: ${subsError.message}`);
    }

    const tokens = (subscriptions || []).map((s: { token: string }) => s.token).filter(Boolean);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, skipped: true, reason: "Sem tokens ativos." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const oauthToken = await getGoogleAccessToken({
      clientEmail: firebaseClientEmail,
      privateKey: firebasePrivateKey,
    });

    const title = "Novo pedido na cozinha";
    const safeShort = body.shortId || "0000";
    const safeCustomer = body.customerName ? ` (${body.customerName})` : "";
    const safeDelivery = body.deliveryType === "entrega" ? "Entrega" : "Retirada";
    const messageBody = `Pedido #${safeShort}${safeCustomer} • ${safeDelivery}`;

    let sent = 0;
    const invalidTokens: string[] = [];

    await Promise.all(
      tokens.map(async (token) => {
        const resp = await fetch(
          `https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${oauthToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token,
                notification: {
                  title,
                  body: messageBody,
                },
                data: {
                  orderId: body.orderId || "",
                  shortId: safeShort,
                  click_action: "/comanda",
                },
                webpush: {
                  fcm_options: {
                    link: "/comanda",
                  },
                  notification: {
                    icon: "https://newneo.com.br/img/logo_hotdog_viviane.png",
                    badge: "https://newneo.com.br/img/logo_hotdog_viviane.png",
                  },
                },
              },
            }),
          },
        );

        if (resp.ok) {
          sent += 1;
          return;
        }

        const errText = await resp.text();
        if (errText.includes("UNREGISTERED") || errText.includes("registration-token-not-registered")) {
          invalidTokens.push(token);
        }
      }),
    );

    if (invalidTokens.length > 0) {
      await supabase.from("push_subscriptions").delete().in("token", invalidTokens);
    }

    return new Response(
      JSON.stringify({ ok: true, sent, total: tokens.length, invalidRemoved: invalidTokens.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});

async function getGoogleAccessToken(input: { clientEmail: string; privateKey: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: input.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsignedJwt = `${enc(header)}.${enc(claimSet)}`;
  const signature = await signJwt(unsignedJwt, input.privateKey);
  const jwt = `${unsignedJwt}.${signature}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResp.ok) {
    const txt = await tokenResp.text();
    throw new Error(`Falha ao obter token OAuth do Google: ${txt}`);
  }

  const tokenJson = await tokenResp.json();
  if (!tokenJson.access_token) {
    throw new Error("Resposta do Google sem access_token.");
  }

  return tokenJson.access_token as string;
}

async function signJwt(data: string, privateKeyPem: string) {
  const pemBody = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");

  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(data),
  );

  return toBase64Url(new Uint8Array(signature));
}

function toBase64Url(input: Uint8Array) {
  let str = "";
  for (let i = 0; i < input.length; i += 1) {
    str += String.fromCharCode(input[i]);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
