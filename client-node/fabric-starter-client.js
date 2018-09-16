const log4js = require('log4js');
log4js.configure(require('./config.json').log4js);
const logger = log4js.getLogger('FabricStarterClient');
const Client = require('fabric-client');
const jwt = require('jsonwebtoken');

class FabricStarterClient {
  constructor() {
    this.client = Client.loadFromConfig('../crypto-config/network.yaml');
    this.peer = this.client.getPeersForOrg()[0];
  }

  async init() {
    await this.client.initCredentialStores();
    this.fabric_ca_client = this.client.getCertificateAuthority();
  }

  async login(username, password) {
    this.user = await this.client.setUserContext({username: username, password: password});
  }

  async register(username, password, affiliation) {
    const registrar = this.fabric_ca_client.getRegistrar()[0];
    const admin = await this.client.setUserContext({username: registrar.enrollId, password: registrar.enrollSecret});
    await this.fabric_ca_client.register({
      enrollmentID: username,
      enrollmentSecret: password,
      affiliation: affiliation,
      maxEnrollments: -1
    }, admin);
  }

  async loginOrRegister(username, password, affiliation) {
    try {
      await this.login(username, password);
    } catch (e) {
      try {
        await this.register(username, password, affiliation);
        await this.login(username, password);
      } catch (e) {
        logger.error('loginOrRegister', e);
      }
    }
  }

  getToken() {
    return jwt.sign({sub: this.user.getName()}, this.getSecret());
  }

  getSecret() {
    const signingIdentity = this.client._getSigningIdentity(true);
    const signedBytes = signingIdentity.sign('licJidNi2Slap.');
    return String.fromCharCode.apply(null, signedBytes);
  }

  async loginWithToken(token) {
    const decoded = jwt.decode(token, this.getSecret());
    logger.trace(JSON.stringify(decoded) + ' ' + token);

    await this.login(decoded.sub);
  }

  async queryChannels() {
    const channelQueryResponse = await this.client.queryChannels(this.peer, true);
    return channelQueryResponse.getChannels();
  }

  async queryInstalledChaincodes() {
    const chaincodeQueryResponse = await this.client.queryInstalledChaincodes(this.peer, true);
    return chaincodeQueryResponse.getChaincodes();
  }

  async getChannel(channelId) {
    let channel;
    try {
      channel = this.client.getChannel(channelId);
    } catch (e) {
      channel = this.client.newChannel(channelId);channel.addPeer(this.peer);
      await channel.initialize({discover: true, asLocalhost:true});
    }
    // logger.trace('channel', channel);
    return channel;
  }

  async invoke(channelId, chaincodeId, fcn, args, targets) {
    const channel = await this.getChannel(channelId);

    const tx_id = this.client.newTransactionID(/*true*/);
    const proposal = {
      chaincodeId: chaincodeId,
      fcn: fcn,
      args: args,
      txId: tx_id,
      targets: targets || [this.peer]
    };

    const proposalResponse = await channel.sendTransactionProposal(proposal);

    // logger.trace('proposalResponse', proposalResponse);

    const transactionRequest = {
      proposalResponses: proposalResponse[0],
      proposal: proposalResponse[1],
    };

    return await channel.sendTransaction(transactionRequest);
  }

  async query(channelId, chaincodeId, fcn, args, targets) {
    const channel = await this.getChannel(channelId);

    const request = {
      chaincodeId: chaincodeId,
      fcn: fcn,
      args: args,
      targets: targets || [this.peer]
    };

    const responses = await channel.queryByChaincode(request);

    return responses.map(r => {
      return r.toString('utf8');
    });
  }

  async getOrganizations(channelId) {
    const channel = await this.getChannel(channelId);
    return channel.getOrganizations();
  }

  async queryInstantiatedChaincodes(channelId) {
    const channel = await this.getChannel(channelId);
    return await channel.queryInstantiatedChaincodes();
  }

  async queryInfo(channelId) {
    const channel = await this.getChannel(channelId);
    return await channel.queryInfo(this.peer, true);
  }
}

module.exports = FabricStarterClient;