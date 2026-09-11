export default {
  name: 'clientReady',
  once: true,
  execute(c) {
    console.log(`Bot online com sucesso como ${c.user.tag}`);
  },
};
