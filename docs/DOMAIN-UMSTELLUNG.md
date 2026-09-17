# Domainumschaltung
Geprüft über Vercel am 17.09.2026.

Die neue Website läuft auf https://getraenke-elias.vercel.app. Beide Domains sind dem Vercel-Projekt `nex-holding/getraenke-elias` zugeordnet. Domainzuordnung bestätigt, DNS-Konfiguration noch offen.

Aktuelle DNS-Zuständigkeit: `dns01.manitu.net` und `dns02.manitu.net`. Bisherige Webadresse: A-Record `89.238.73.150`.

## Erforderliche Web-DNS-Einträge bei manitu

| Typ | Name | Ziel |
| --- | --- | --- |
| A | @ | 216.150.1.1 |
| A | @ | 216.150.16.1 |
| CNAME | www | 65ebadfa327a3b95.vercel-dns-016.com. |

Dies sind die projektspezifisch von Vercel empfohlenen Einträge zum Prüfzeitpunkt. Unmittelbar vor Änderung erneut mit `vercel domains verify` kontrollieren. Bestehende widersprechende Web-A/AAAA-Einträge ersetzen; E-Mail-DNS (MX, SPF, DKIM, DMARC) und weitere Dienste erhalten. Kein pauschaler Nameserverwechsel vorgesehen.

Nach DNS-Verteilung:
1. `vercel domains verify getraenke-elias.de --scope nex-holding`
2. `vercel domains verify www.getraenke-elias.de --scope nex-holding`
3. TLS und die gewünschte www/apex-Weiterleitung prüfen.
4. `NEXT_PUBLIC_SITE_URL` auf die endgültige Domain setzen, neu deployen und die Supabase-Auth-Redirects entsprechend pflegen.
5. Website, Mitarbeiterlogin und Lieferanfrage über die Originaldomain nochmals prüfen.

Es liegt derzeit kein Zugang zur DNS-Verwaltung bei manitu vor. Die bisherigen DNS-Einträge wurden nicht verändert.
