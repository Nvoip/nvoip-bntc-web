# Nvoip BNTC Web

Nvoip BNTC, ou Best Number to Call, exibe automaticamente o telefone mais adequado para cada visitante com base em localização aproximada, DDD, país, regras de fallback e grupos de snippet.

Esta versão funciona em qualquer site HTML, landing page ou aplicação web. Para WordPress, use o plugin Nvoip BNTC.

## Instalação rápida

1. Publique o arquivo `dist/nvoip-bntc-web.js` no seu site.
2. Configure seus números antes de carregar o script.
3. Use `{nvoip_bntc}` ou elementos com `data-nvoip-bntc`.

```html
<script>
  window.NvoipBNTC = {
    defaultNumber: "551141186267",
    format: "national",
    cacheHours: 24,
    maxDistanceKm: 450,
    ipFallback: true,
    numbers: [
      {
        phone: "551141186267",
        label: "São Paulo",
        city: "São Paulo",
        state: "SP",
        country: "BR",
        areaCode: "11",
        lat: -23.5505,
        lng: -46.6333,
        group: "default",
        priority: 10
      }
    ],
    specialNumbers: [
      {
        phone: "558008783122",
        label: "0800 nacional",
        country: "BR",
        group: "default",
        mode: "fallback",
        allowedPaths: ["/contato", "/precos"]
      }
    ]
  };
</script>
<script src="/dist/nvoip-bntc-web.js" defer></script>
```

## Como usar no HTML

```html
<a href="tel:{nvoip_bntc}">
  <span data-nvoip-bntc>{nvoip_bntc}</span>
</a>

<a href="tel:{nvoip_bntc:vendas}">
  <span data-nvoip-bntc data-bntc-group="vendas">{nvoip_bntc:vendas}</span>
</a>
```

Também é possível deixar o token diretamente no texto da página. O script troca `{nvoip_bntc}` e `{nvoip_bntc:nome-do-grupo}` por spans controlados pelo BNTC.

## Configuração por arquivo JSON

Em vez de declarar `window.NvoipBNTC`, você pode carregar um JSON:

```html
<script src="/dist/nvoip-bntc-web.js" data-config="/config/nvoip-bntc.config.json" defer></script>
```

## Regras especiais

Use `specialNumbers` para números como 4003 ou 0800.

- `mode: "fallback"`: usa o número especial apenas se não houver número local melhor.
- `mode: "override"`: permite o número especial sobrescrever o número local quando as regras baterem.
- `allowedPaths`: limita por URL, aceitando caminhos exatos ou prefixos com `*`.
- `eligibleAreaCodes`: limita por DDD detectado.

## Debug

Adicione `?nvoip_bntc_debug=1` na URL para ver o painel de diagnóstico.

Para simular localização:

```text
?nvoip_bntc_lat=-21.7642&nvoip_bntc_lng=-43.3496
```

## Serviços externos

Quando o visitante não autoriza geolocalização do navegador, o fallback por IP consulta o serviço público GeoJS (`https://get.geojs.io/v1/ip/geo.json`). Desative com `ipFallback: false`.
