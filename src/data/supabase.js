import { createClient } from "@supabase/supabase-js";
import { tables, emptyData } from "../core.js";
export function readConfig() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem("study-cloud-config") || "{}");
  } catch {}
  return {
    url: import.meta.env.VITE_SUPABASE_URL || saved.url || "",
    key: import.meta.env.VITE_SUPABASE_ANON_KEY || saved.key || "",
  };
}
export function validateConfig(config) {
  if (!/^https:\/\/[^/]+\/?$/.test(config.url))
    throw new Error("项目 URL 需要是 https:// 开头的 Supabase 地址。");
  if (config.key.startsWith("sb_secret_"))
    throw new Error("不能使用 secret key，请填写 publishable / anon key。");
  if (config.key.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(
        atob(config.key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role !== "anon") throw new Error("wrong role");
    } catch {
      throw new Error("仅允许 anon key，不能使用 service_role key。");
    }
  } else if (!config.key.startsWith("sb_publishable_"))
    throw new Error("请填写 Supabase publishable / anon key。");
}
export function connect(config) {
  validateConfig(config);
  return createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
function check(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export class SupabaseRepository {
  constructor(client) {
    this.client = client;
    this.bucket = client.storage.from("study-images");
  }
  async load() {
    const data = emptyData();
    await Promise.all(
      tables.map(async (table) => {
        let offset = 0;
        while (true) {
          const rows = check(
            await this.client
              .from(table)
              .select("*")
              .order("id")
              .range(offset, offset + 999),
          );
          data[table].push(...rows);
          if (rows.length < 1000) break;
          offset += 1000;
        }
      }),
    );
    return data;
  }
  async put(table, row) {
    check(await this.client.from(table).upsert(row));
    return row;
  }
  async putMany(table, rows) {
    if (rows.length) check(await this.client.from(table).upsert(rows));
  }
  async ensureDaily(rows) {
    if (rows.length)
      check(
        await this.client
          .from("tasks")
          .upsert(rows, {
            onConflict: "user_id,template_id,template_date",
            ignoreDuplicates: true,
          }),
      );
  }
  async remove(table, id) {
    check(await this.client.from(table).delete().eq("id", id));
  }
  async saveMaterial(material, images, deletedIds) {
    check(
      await this.client.rpc("save_study_material", {
        p_material: material,
        p_images: images,
        p_deleted_ids: deletedIds,
      }),
    );
  }
  async deleteMaterial(material) {
    check(
      await this.client.rpc("delete_study_material", { p_id: material.id }),
    );
  }
  async upload(path, blob) {
    const result = await this.bucket.upload(path, blob, {
      contentType: blob.type,
      upsert: false,
      cacheControl: "3600",
    });
    if (
      result.error &&
      !(
        String(result.error.statusCode) === "409" ||
        result.error.message === "The resource already exists"
      )
    )
      check(result);
    return path;
  }
  async deleteFiles(paths) {
    if (paths.length) check(await this.bucket.remove([...new Set(paths)]));
  }
  async imageURL(path) {
    return check(await this.bucket.createSignedUrl(path, 3600)).signedUrl;
  }
  async login(email, password) {
    return check(
      await this.client.auth.signInWithPassword({ email, password }),
    );
  }
  async logout() {
    check(await this.client.auth.signOut());
  }
}
