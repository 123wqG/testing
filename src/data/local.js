import { tables, emptyData } from "../core.js";
let database;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("study-workbench-v1", 1);
    request.onupgradeneeded = () => {
      for (const name of [...tables, "blobs"])
        request.result.createObjectStore(name, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
async function transaction(names, mode, run) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(names, mode);
    let result;
    try {
      result = run(tx);
    } catch (e) {
      tx.abort();
      reject(e);
      return;
    }
    tx.oncomplete = () =>
      resolve(typeof result === "function" ? result() : result);
    tx.onerror = () => reject(tx.error || new Error("本地保存失败"));
    tx.onabort = () => reject(tx.error || new Error("本地保存已取消"));
  });
}
export class LocalRepository {
  async load() {
    return transaction(tables, "readonly", (tx) => {
      const data = emptyData();
      for (const t of tables) {
        const r = tx.objectStore(t).getAll();
        r.onsuccess = () => (data[t] = r.result);
      }
      return () => data;
    });
  }
  async put(table, row) {
    await transaction([table], "readwrite", (tx) =>
      tx.objectStore(table).put(row),
    );
    return row;
  }
  async putMany(table, rows) {
    await transaction([table], "readwrite", (tx) =>
      rows.forEach((row) => tx.objectStore(table).put(row)),
    );
  }
  async ensureDaily(rows) {
    await transaction(["tasks"], "readwrite", (tx) => {
      const s = tx.objectStore("tasks"),
        r = s.getAll();
      r.onsuccess = () => {
        for (const row of rows)
          if (
            !r.result.some(
              (t) =>
                t.template_id === row.template_id &&
                t.template_date === row.template_date,
            )
          )
            s.put(row);
      };
    });
  }
  async remove(table, id) {
    return transaction([table], "readwrite", (tx) =>
      tx.objectStore(table).delete(id),
    );
  }
  async saveMaterial(material, images, deletedIds) {
    await transaction(
      ["study_materials", "material_images"],
      "readwrite",
      (tx) => {
        tx.objectStore("study_materials").put(material);
        images.forEach((i) => tx.objectStore("material_images").put(i));
        deletedIds.forEach((id) =>
          tx.objectStore("material_images").delete(id),
        );
      },
    );
  }
  async deleteMaterial(material) {
    await transaction(
      ["study_materials", "material_images"],
      "readwrite",
      (tx) => {
        tx.objectStore("study_materials").put(material);
        const r = tx.objectStore("material_images").getAll();
        r.onsuccess = () =>
          r.result
            .filter((i) => i.material_id === material.id)
            .forEach((i) => tx.objectStore("material_images").delete(i.id));
      },
    );
  }
  async upload(path, blob) {
    await transaction(["blobs"], "readwrite", (tx) =>
      tx.objectStore("blobs").put({ id: path, blob }),
    );
    return path;
  }
  async deleteFiles(paths) {
    await transaction(["blobs"], "readwrite", (tx) =>
      paths.forEach((path) => tx.objectStore("blobs").delete(path)),
    );
  }
  async imageURL(path) {
    const row = await transaction(["blobs"], "readonly", (tx) => {
      const r = tx.objectStore("blobs").get(path);
      return () => r.result;
    });
    if (!row) throw new Error("找不到本地图片");
    return URL.createObjectURL(row.blob);
  }
}
