// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PushPayload = {
  orderId?: string;
  customerId?: string | null;
  totalPrice?: number;
  deliveryType?: string;
  createdAtIso?: string;
  type?: string;
  newStatus?: string;
  role?: "kds" | "admin" | "customer" | "all";
  token?: string;
  test?: boolean;
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

    // ==========================
    // MODO TESTE (diagnóstico)
    // ==========================
    const isTest = body.test === true || body.type === "test";

    if (isTest) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      let tokens: string[] = [];

      if (body.token && body.token.length > 20) {
        tokens = [body.token];
      } else {
        const role = body.role || "all";
        let q = supabase
          .from("push_subscriptions")
          .select("token")
          .eq("is_active", true);

        if (role !== "all") {
          q = q.eq("role", role);
        }

        const { data: subs, error: subsError } = await q;
        if (subsError) throw subsError;
        tokens = (subs || []).map((s: { token: string }) => s.token);
      }

      if (tokens.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, mode: "test", message: "Nenhum token encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      const oauthToken = await getGoogleAccessToken({
        clientEmail: firebaseClientEmail,
        privateKey: firebasePrivateKey,
      });

      const messageTitle = "✅ Push de Teste (Hotdog Viviane)";
      const messageBody = `Se você recebeu isso, o FCM está OK. (${new Date().toISOString()})`;

      let sent = 0;
      const invalidTokens: string[] = [];
      const errors: Array<{ tokenPrefix: string; error: string }> = [];

      await Promise.all(
        tokens.map(async (token) => {
          try {
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
                      title: messageTitle,
                      body: messageBody,
                    },
                    data: {
                      click_action: "/",
                    },
                    webpush: {
                      fcm_options: {
                        link: "/",
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
            } else {
              const errText = await resp.text();
              console.warn(`Erro FCM para token ${token.substring(0, 10)}... : ${errText}`);
              if (errors.length < 5) {
                errors.push({
                  tokenPrefix: `${token.substring(0, 10)}...`,
                  error: errText.slice(0, 500),
                });
              }
              if (errText.includes("UNREGISTERED") || errText.includes("registration-token-not-registered")) {
                invalidTokens.push(token);
              }
            }
          } catch (e) {
            console.error(`Falha ao disparar fetch FCM (test): ${e.message}`);
            if (errors.length < 5) {
              errors.push({
                tokenPrefix: `${token.substring(0, 10)}...`,
                error: String(e?.message || e).slice(0, 300),
              });
            }
          }
        }),
      );

      if (invalidTokens.length > 0) {
        await supabase.from("push_subscriptions").delete().in("token", invalidTokens);
      }

      return new Response(
        JSON.stringify({ ok: true, mode: "test", sent, total: tokens.length, invalidRemoved: invalidTokens.length, errors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    let orderData: {
      id: string;
      created_at: string;
      delivery_type: string;
      customer_details: unknown;
    } | null = null;

    let orderErr: { message?: string } | null = null;

    if (body.orderId) {
      const byId = await supabase
        .from("orders")
        .select("id, created_at, delivery_type, customer_details")
        .eq("id", body.orderId)
        .maybeSingle();
      orderData = byId.data;
      orderErr = byId.error;
    } else {
      const createdAt = body.createdAtIso ? new Date(body.createdAtIso) : new Date();
      const fromDate = new Date(createdAt.getTime() - 1000 * 60 * 5).toISOString();

      let q = supabase
        .from("orders")
        .select("id, created_at, delivery_type, customer_details, total_price, customer_id")
        .gte("created_at", fromDate)
        .order("created_at", { ascending: false })
        .limit(1);

      if (body.customerId) {
        q = q.eq("customer_id", body.customerId);
      }
      if (typeof body.totalPrice === "number") {
        q = q.eq("total_price", body.totalPrice);
      }
      if (body.deliveryType) {
        q = q.eq("delivery_type", body.deliveryType);
      }

      const fallback = await q.maybeSingle();
      orderData = fallback.data;
      orderErr = fallback.error;
    }

    if (orderErr) {
      throw new Error(`Erro ao buscar pedido: ${orderErr.message}`);
    }

    if (!orderData || !orderData.id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Pedido não encontrado." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
      );
    }
    const { type, newStatus } = body;
    const finalOrderId = body.orderId || orderData.id;
    const safeShort = shortIdFromUuid(finalOrderId);
    const finalTotalPrice = body.totalPrice || orderData.total_price || 0;

    console.log('Dados Processados:', { finalOrderId, safeShort, type, newStatus })

    let tokens: string[] = []
    let notificationTitle = "🍕 Novo Pedido!"
    let notificationBody = `Pedido #${safeShort} no valor de R$ ${Number(finalTotalPrice).toFixed(2)}`

    // MODO 1: Notificar Cozinha/Admin sobre novo pedido
    if (!type || type === 'new_order') {
      const { data: subs, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('token')
        .in('role', ['kds', 'admin'])
        .eq('is_active', true)

      if (subsError) throw subsError
      tokens = subs.map(s => s.token)
      console.log(`Encontrados ${tokens.length} tokens para KDS/Admin`);
    } 
    // MODO 2: Notificar Cliente sobre mudança de status
    else if (type === 'status_update') {
      const { data: subs, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('token')
        .eq('role', 'customer')
        .eq('is_active', true)

      if (subsError) throw subsError
      tokens = subs.map(s => s.token)
      console.log(`Encontrados ${tokens.length} tokens para Clientes`);

      notificationTitle = newStatus === 'pronto' ? "🌭 Seu pedido está pronto!" : "👨‍🍳 Pedido sendo preparado"
      notificationBody = newStatus === 'pronto' 
        ? `Seu pedido #${safeShort} no Hotdog Viviane ficou pronto!` 
        : `Seu pedido #${safeShort} já entrou na cozinha!`
    }

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'Nenhum token encontrado' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const oauthToken = await getGoogleAccessToken({
      clientEmail: firebaseClientEmail,
      privateKey: firebasePrivateKey,
    });

    const messageTitle = notificationTitle;
    const messageBody = notificationBody;

    let sent = 0;
    const invalidTokens: string[] = [];

    await Promise.all(
      tokens.map(async (token) => {
        try {
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
                    title: messageTitle,
                    body: messageBody,
                  },
                  data: {
                    orderId: String(finalOrderId),
                    shortId: String(safeShort),
                    click_action: "/comanda.html",
                  },
                  webpush: {
                    fcm_options: {
                      link: "/comanda.html",
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
          } else {
            const errText = await resp.text();
            console.warn(`Erro FCM para token ${token.substring(0, 10)}... : ${errText}`);
            if (errText.includes("UNREGISTERED") || errText.includes("registration-token-not-registered")) {
              invalidTokens.push(token);
            }
          }
        } catch (e) {
          console.error(`Falha ao disparar fetch FCM: ${e.message}`);
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

function shortIdFromUuid(id: string) {
  const hex = id.replace(/-/g, "").slice(0, 8);
  const parsed = Number.parseInt(hex, 16);
  if (Number.isNaN(parsed)) return "0000";
  return parsed.toString().slice(-4).padStart(4, "0");
}

function parseCustomerDetails(input: unknown): { name: string } {
  if (!input) return { name: "" };
  if (typeof input === "object" && input !== null && "name" in input) {
    const name = (input as { name?: unknown }).name;
    return { name: typeof name === "string" ? name : "" };
  }

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input) as { name?: unknown };
      return { name: typeof parsed?.name === "string" ? parsed.name : "" };
    } catch {
      return { name: "" };
    }
  }

  return { name: "" };
}
