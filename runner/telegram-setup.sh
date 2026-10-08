#!/usr/bin/env bash
# Configura los avisos de Telegram en el VPS sin que el token pase por ningun chat:
#   ssh -t root@94.143.143.73 'bash /opt/halo-runner/telegram-setup.sh'
# Antes: crea el bot con @BotFather (/newbot), crea el grupo y AÑADE el bot al grupo.
set -e
cd /opt/halo-runner

read -rsp "Pega el token del bot (no se vera al escribirlo) y pulsa Enter: " TOKEN; echo
if ! curl -s "https://api.telegram.org/bot$TOKEN/getMe" | grep -q '"ok":true'; then echo "Ese token no es valido."; exit 1; fi
echo "Token correcto."

# Por si el bot tuviera un webhook puesto (impediria leer los mensajes); no hace nada si no lo tiene
curl -s "https://api.telegram.org/bot$TOKEN/deleteWebhook" >/dev/null || true

echo
echo "Ahora, EN EL GRUPO (con el bot ya dentro), escribe exactamente:  /start"
echo "(Telegram solo entrega a los bots los comandos que empiezan por /; un mensaje normal no les llega)."
echo "Cuando lo hayas escrito, pulsa Enter aqui."
read -r _
buscar() { # $1 = tipo de chat: group | private
  curl -s "https://api.telegram.org/bot$TOKEN/getUpdates?allowed_updates=%5B%22message%22%2C%22my_chat_member%22%2C%22channel_post%22%5D" | python3 -c '
import sys, json
tipo = sys.argv[1]
datos = json.load(sys.stdin)
vistos = {}
todos = {}
for u in datos.get("result", []):
    for k in ("message", "my_chat_member", "edited_message", "channel_post"):
        c = (u.get(k) or {}).get("chat")
        if not c: continue
        t = c.get("type")
        todos[c["id"]] = (t, c.get("title") or c.get("first_name") or "")
        if (tipo == "group" and t in ("group", "supergroup")) or (tipo == "private" and t == "private"):
            vistos[c["id"]] = c.get("title") or c.get("first_name") or str(c["id"])
for i, n in vistos.items(): print(f"{i}	{n}")
if not vistos and tipo == "group":
    sys.stderr.write("[diagnostico] ok=%s actualizaciones=%s chats_vistos=%s\n" % (datos.get("ok"), len(datos.get("result", [])), list(todos.values())))
' "$1"
}
GRUPOS=$(buscar group)
if [ -z "$GRUPOS" ]; then echo "No veo ningun grupo. Comprueba que el bot esta DENTRO del grupo y que has escrito /start en el grupo, y vuelve a ejecutar."; exit 1; fi
CHAT=$(echo "$GRUPOS" | head -n1 | cut -f1)
echo "Grupo elegido: $(echo "$GRUPOS" | head -n1 | cut -f2) ($CHAT)"

echo
echo "OPCIONAL: para recibir en tu chat PERSONAL los avisos de tus modelos privadas (el grupo NO los recibe):"
echo "abre el bot en Telegram, pulsa Start, escribele 'hola' y pulsa Enter aqui. (Solo Enter para saltarlo)"
read -r _
PRIV=$(buscar private | head -n1 | cut -f1)
[ -n "$PRIV" ] && echo "Chat personal detectado." || echo "Sin chat personal: las modelos privadas no enviaran avisos."

sed -i '/^TELEGRAM_BOT_TOKEN=/d;/^TELEGRAM_CHAT_ID=/d;/^TELEGRAM_CHAT_ID_PRIVADO=/d' .env
{
  echo "TELEGRAM_BOT_TOKEN=$TOKEN"
  echo "TELEGRAM_CHAT_ID=$CHAT"
  [ -n "$PRIV" ] && echo "TELEGRAM_CHAT_ID_PRIVADO=$PRIV"
} >> .env
pm2 restart halo-runner --update-env >/dev/null
echo
echo "Listo. En el panel: Ajustes > Sistema > Avisos por Telegram > 'Enviar mensaje de prueba'."
