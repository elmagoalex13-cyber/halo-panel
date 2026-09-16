import { Readable } from "node:stream";
import { google } from "googleapis";

const TYPE_FOLDERS: Record<string, string> = {
  tipo1: "Tipo 1 - Camara + Whisper",
  tipo2: "Tipo 2 - Caption Overlay",
  tipo3: "Tipo 3 - Reto",
  sin_clasificar: "Sin clasificar",
};

function driveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !privateKey) {
    throw new Error("Missing Google Drive service account credentials");
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

export async function createFolderIfNotExists(name: string, parentId: string) {
  const drive = driveClient();
  const escapedName = name.replace(/'/g, "\\'");
  const { data } = await drive.files.list({
    q: `'${parentId}' in parents and name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });

  const existing = data.files?.[0];
  if (existing?.id) return existing.id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });

  if (!created.data.id) throw new Error("Google Drive folder creation failed");
  return created.data.id;
}

export async function uploadToDrive(input: {
  nombreModelo: string;
  tipoVideo: string;
  filename: string;
  buffer: Buffer;
  mimeType: string;
}) {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) throw new Error("Missing GOOGLE_DRIVE_ROOT_FOLDER_ID");

  const drive = driveClient();
  const modelFolderId = await createFolderIfNotExists(input.nombreModelo, rootFolderId);
  const typeFolderId = await createFolderIfNotExists(TYPE_FOLDERS[input.tipoVideo] ?? input.tipoVideo, modelFolderId);
  const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");

  const uploaded = await drive.files.create({
    requestBody: {
      name: `${stamp}_${input.filename}`,
      parents: [typeFolderId],
    },
    media: {
      mimeType: input.mimeType,
      body: Readable.from(input.buffer),
    },
    fields: "id,webViewLink",
  });

  return uploaded.data.webViewLink ?? `https://drive.google.com/file/d/${uploaded.data.id}/view`;
}
