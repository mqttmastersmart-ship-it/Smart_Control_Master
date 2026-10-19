# Fenix Smart Control — usuário final V13 instalável (PWA)

Aplicativo separado em arquivos estáticos, pronto para GitHub Pages, com instalação na tela inicial e abertura em janela própria.

## Atualizar o repositório que já está publicado

Se você baixou **ATUALIZAR_PWA_GITHUB.zip**, extraia o ZIP e envie todos os arquivos extraídos para a raiz do repositório **Smart_Control_Master**, junto de `index.html`. Substitua os arquivos de mesmo nome e confirme o envio. Esse pacote é uma atualização: ele usa a pasta `logos/` que já deve existir no repositório, com as quatro imagens. A configuração MQTT e a lógica em `app.js` são as mesmas da versão V13 separada anteriormente.

Depois da publicação do GitHub Pages, atualize a página no navegador e teste pelo endereço do site. Para uma instalação nova completa, use o pacote **FENIX_SMART_CONTROL_PWA_COMPLETO.zip**, que também inclui as imagens.

## Arquivos

- `index.html`: estrutura da interface.
- `styles.css`: aparência, layout e estilos responsivos.
- `app.js`: lógica da interface e conexão MQTT.
- `pwa.js`: convite de instalação e instruções para cada plataforma.
- `manifest.webmanifest`: nome, ícones e abertura como aplicativo.
- `sw.js`: cache dos arquivos da interface.
- `icon-192.png`, `icon-512.png` e `apple-touch-icon.png`: ícones de instalação.
- `icon.svg`: fonte vetorial do ícone com a letra F.
- `logos/`: logotipos e imagens dos botões.
- `.nojekyll`: indica ao GitHub Pages que o site é estático.

## Publicar no GitHub Pages

1. Extraia o ZIP no computador.
2. Envie o **conteúdo** da pasta `FENIX_SMART_CONTROL_PWA` para a raiz do repositório. Substitua os arquivos antigos pelos novos. Mantenha a pasta `logos/` com as quatro imagens; os demais arquivos ficam na raiz, incluindo os três ícones PNG.
3. No repositório, abra **Settings → Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**.
5. Escolha a branch `main` (ou a branch usada no envio), a pasta **/ (root)** e clique em **Save**.
6. Aguarde a publicação e abra o endereço indicado pelo GitHub Pages.

Não é necessário instalar pacotes nem executar um build. Não envie somente o ZIP ao repositório: envie os arquivos extraídos.

Referência: [documentação oficial de publicação do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Instalar no celular ou computador

1. Depois da publicação, abra o endereço **HTTPS do GitHub Pages**, não o endereço da lista de arquivos do repositório.
2. Na parte superior, aparece o convite para instalar o Smart Control.
3. No Chrome/Edge, quando o navegador disponibilizar a instalação, o botão passa a ser **Instalar app**. Toque e confirme a instalação.
4. Se aparecer **Como instalar**, o botão mostra o caminho pelo menu do navegador.
5. No iPhone/iPad, abra no Safari e use **Compartilhar → Adicionar à Tela de Início**. Se aparecer **Abrir como App**, mantenha essa opção ativada.
6. Depois, abra pelo ícone criado. O aplicativo usa uma janela própria, sem a barra de endereço comum do navegador.

O navegador controla quando disponibilizar a confirmação de instalação. O site não instala sozinho nem consegue forçar a caixa de confirmação ao abrir o link. O aviso do site aparece na primeira abertura; **Agora não** o oculta por sete dias naquele navegador. Dentro da janela instalada, o aviso fica oculto.

Instalação: [documentação MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable). Comportamento no iPhone/iPad: [WebKit](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).

## Internet e atualizações

O cache guarda somente os arquivos locais da interface. Ele não armazena dados da central nem envia comandos pendentes. **Monitoramento e comandos precisam de internet e da conexão MQTT.** A biblioteca MQTT externa também precisa de internet para carregar.

Os arquivos do site são buscados na rede primeiro; a cópia local serve como alternativa para abrir a interface quando não houver rede. Após atualizar arquivos no GitHub, feche e reabra o aplicativo. Nas próximas versões, ao alterar a lista de arquivos do cache, altere também o sufixo `v1` em `CACHE_NAME` no arquivo `sw.js`. A atualização do service worker aguarda fechar as janelas abertas, sem recarregar o painel em operação.

## Conexão e configuração

A biblioteca MQTT continua sendo carregada pelo endereço externo que já existia na V13; ela exige acesso à internet. O endereço do broker, usuário, senha e tópicos continuam no objeto `mqttConfig`, no início de `app.js`, preservando a configuração original.

**Atenção:** a configuração original contém credenciais MQTT. Em um site estático, o conteúdo de `app.js` fica acessível a quem abre o site, mesmo que o repositório seja privado. Antes de publicar, use credenciais próprias para o aplicativo, com permissões limitadas no broker. Separar os arquivos não oculta a senha.

## Alterações realizadas

- CSS e JavaScript extraídos para arquivos próprios.
- Estilos dos atributos HTML convertidos em classes no CSS.
- Referências relativas para funcionar também em um subdiretório do GitHub Pages.
- Nome do logotipo Águas do Cerrado corrigido para corresponder exatamente ao arquivo `logos/logo-aguas-do-cerrado.png`.
- Lógica e configuração MQTT preservadas. O arquivo HTML original não foi alterado.
