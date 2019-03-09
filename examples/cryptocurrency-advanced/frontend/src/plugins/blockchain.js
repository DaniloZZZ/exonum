import * as Exonum from 'exonum-client'
import axios from 'axios'
import * as proto from '../../proto/stubs.js'

const TRANSACTION_URL = '/api/explorer/v1/transactions'
const PER_PAGE = 10
const SERVICE_ID = 128
const TX_TRANSFER_ID = 0
const TX_ISSUE_ID = 1
const TX_WALLET_ID = 2
const TX_SIGN_MSIG_ID = 3
const TX_TRANSFER_MSIG_ID = 4
const TABLE_INDEX = 0
const Wallet = Exonum.newType(proto.exonum.examples.cryptocurrency_advanced.Wallet)

function TransferTransaction(publicKey) {
  return Exonum.newTransaction({
    author: publicKey,
    service_id: SERVICE_ID,
    message_id: TX_TRANSFER_ID,
    schema: proto.exonum.examples.cryptocurrency_advanced.Transfer
  })
}

function IssueTransaction(publicKey) {
  return Exonum.newTransaction({
    author: publicKey,
    service_id: SERVICE_ID,
    message_id: TX_ISSUE_ID,
    schema: proto.exonum.examples.cryptocurrency_advanced.Issue
  })
}

function CreateTransaction(publicKey) {
  return Exonum.newTransaction({
    author: publicKey,
    service_id: SERVICE_ID,
    message_id: TX_WALLET_ID,
    schema: proto.exonum.examples.cryptocurrency_advanced.CreateWallet
  })
}

function getTransaction(transaction, publicKey) {
  if (transaction.name) {
    return new CreateTransaction(publicKey)
  }

  if (transaction.to) {
    return new TransferTransaction(publicKey)
  }

  return new IssueTransaction(publicKey)
}

module.exports = {
  install(Vue) {
    Vue.prototype.$blockchain = {
      generateKeyPair() {
        return Exonum.keyPair()
      },

      generateSeed() {
        return Exonum.randomUint64()
      },

      createWallet(keyPair, name) {
        // Describe transaction
        const transaction = new CreateTransaction(keyPair.publicKey)

        // Transaction data
        const data = {
          name: name
        }

        // Send transaction into blockchain
        return transaction.send(TRANSACTION_URL, data, keyPair.secretKey)
      },

      addFunds(keyPair, amountToAdd, seed) {
        // Describe transaction
        const transaction = new IssueTransaction(keyPair.publicKey)

        // Transaction data
        const data = {
          amount: amountToAdd.toString(),
          seed: seed
        }

        // Send transaction into blockchain
        return transaction.send(TRANSACTION_URL, data, keyPair.secretKey)
      },

      sign_msig(keyPair, hash, seed) {
        // Describe transaction
        const transaction = Exonum.newTransaction({
            author: keyPair.publicKey,
            service_id: SERVICE_ID,
            message_id: TX_SIGN_MSIG_ID,
            schema: proto.exonum.examples.cryptocurrency_advanced.TxSign
        })
        console.log('hash',hash)

        // Transaction data
        const data = {
          tx_hash: { data: Exonum.hexadecimalToUint8Array(hash) },
          signer: { data: Exonum.hexadecimalToUint8Array(keyPair.publicKey) },
        }

        // Send transaction into blockchain
        return transaction.send(TRANSACTION_URL, data, keyPair.secretKey)
      },

      msig_transfer(keyPair,receiver,amount, approver1, approver2, seed) {
        // Describe transaction
        const transaction = Exonum.newTransaction({
            author: keyPair.publicKey,
            service_id: SERVICE_ID,
            message_id: TX_TRANSFER_MSIG_ID,
            schema: proto.exonum.examples.cryptocurrency_advanced.TransferMultisig,
        })
        console.log('receiver',receiver)
        console.log('amount',amount)
        console.log('approvers',approver1, approver2)
        const approvers = [approver1,approver2].map((a)=>{
            return { data:Exonum.hexadecimalToUint8Array(a) }
        });

        // Transaction data
        const data = {
            to: { data: Exonum.hexadecimalToUint8Array(receiver) },
          //from: { data:Exonum.hexadecimalToUint8Array(keyPair.publicKey) },
            amount: amount,
            approvers: approvers,
            seed:seed
        };
        console.log("data",data);

        // Send transaction into blockchain
        return transaction.send(TRANSACTION_URL, data, keyPair.secretKey)
      },
      test_real(){
        const names =[ 'sender','receiver','approver','approver']
        const accounts = names.map((name)=>{
          const keyp = this.generateKeyPair()
          return { 'name':name,'keys':keyp }
        });
        const promises =accounts.map((acc)=>{
          this.createWallet(acc.keys,acc.name)
        });
        let delay = (time) => (result) => new Promise(resolve => setTimeout(() => resolve(result), time));
        return Promise.all(promises).then(delay(300)).then(values=>{
          const amountToAdd = '50'
          const seed = '9935800087578782468'

          // Add funds
          const addp = this.addFunds(accounts[0].keys, amountToAdd, seed)
          // Create a multisig
          const recv  = accounts[1].keys.publicKey
          console.log("keys of receiver",accounts[1].keys)
          console.log("keys of sender",accounts[0].keys)
          const app1 = accounts[2].keys.publicKey
          const app2 = accounts[3].keys.publicKey
          const msigp = this.msig_transfer(accounts[0].keys, recv, amountToAdd, app1, app2, seed)
          return addp.then(txhash=>{
            console.log("created wallet tx:",txhash)
            console.log("making msig")
            return msigp
          }).then(delay(300)).then(txhash=>{
            const sign1p = this.sign_msig(accounts[2].keys,txhash,0);
            const sign2p = this.sign_msig(accounts[3].keys,txhash,0);
            return sign1p.then(delay(300)).then(sign2p).then(()=>{
              console.log("signed the tx, checking walled balance")
              return this.getWallet(accounts[0].keys.publicKey).then( (data)=>{
                console.log('data',data)
              });
            });
          });

        });

      },

      transfer(keyPair, receiver, amountToTransfer, seed) {
        // Describe transaction
        const transaction = new TransferTransaction(keyPair.publicKey)

        // Transaction data
        const data = {
          to: { data: Exonum.hexadecimalToUint8Array(receiver) },
          amount: amountToTransfer,
          seed: seed
        }

        // Send transaction into blockchain
        return transaction.send(TRANSACTION_URL, data, keyPair.secretKey)
      },

      getWallet(publicKey) {
        return axios.get('/api/services/configuration/v1/configs/actual').then(response => {
          // actual list of public keys of validators
          const validators = response.data.config.validator_keys.map(validator => {
            return validator.consensus_key
          })

          return axios.get(`/api/services/cryptocurrency/v1/wallets/info?pub_key=${publicKey}`)
            .then(response => response.data)
            .then(data => {
              return Exonum.verifyBlock(data.block_proof, validators).then(() => {
                // verify table timestamps in the root tree
                const tableRootHash = Exonum.verifyTable(data.wallet_proof.to_table, data.block_proof.block.state_hash, SERVICE_ID, TABLE_INDEX)

                // find wallet in the tree of all wallets
                const walletProof = new Exonum.MapProof(data.wallet_proof.to_wallet, Exonum.PublicKey, Wallet)
                if (walletProof.merkleRoot !== tableRootHash) {
                  throw new Error('Wallet proof is corrupted')
                }
                const wallet = walletProof.entries.get(publicKey)
                if (typeof wallet === 'undefined') {
                  throw new Error('Wallet not found')
                }

                // get transactions
                const transactionsMetaData = Exonum.merkleProof(
                  Exonum.uint8ArrayToHexadecimal(new Uint8Array(wallet.history_hash.data)),
                  wallet.history_len,
                  data.wallet_history.proof,
                  [0, wallet.history_len],
                  Exonum.Hash
                )

                if (data.wallet_history.transactions.length !== transactionsMetaData.length) {
                  // number of transactions in wallet history is not equal
                  // to number of transactions in array with transactions meta data
                  throw new Error('Transactions can not be verified')
                }

                // validate each transaction
                const transactions = []
                let index = 0

                for (let transaction of data.wallet_history.transactions) {
                  const hash = transactionsMetaData[index++]
                  const buffer = Exonum.hexadecimalToUint8Array(transaction.message)
                  const bufferWithoutSignature = buffer.subarray(0, buffer.length - 64)
                  const author = Exonum.uint8ArrayToHexadecimal(buffer.subarray(0, 32))
                  const signature = Exonum.uint8ArrayToHexadecimal(buffer.subarray(buffer.length - 64, buffer.length));

                  const Transaction = getTransaction(transaction.debug, author)

                  if (Exonum.hash(buffer) !== hash) {
                    throw new Error('Invalid transaction hash')
                  }

                  // serialize transaction and compare with message
                  if (!Transaction.serialize(transaction.debug).every(function (el, i) {
                    return el === bufferWithoutSignature[i]
                  })) {
                    throw new Error('Invalid transaction message')
                  }

                  if (!Transaction.verifySignature(signature, author, transaction.debug)) {
                    throw new Error('Invalid transaction signature')
                  }

                  const transactionData = Object.assign({ hash: hash }, transaction.debug)
                  if (transactionData.to) {
                    transactionData.to = Exonum.uint8ArrayToHexadecimal(new Uint8Array(transactionData.to.data))
                  }
                  transactions.push(transactionData)
                }

                return {
                  block: data.block_proof.block,
                  wallet: wallet,
                  transactions: transactions
                }
              })
            })
        })
      },

      getBlocks(latest) {
        const suffix = !isNaN(latest) ? '&latest=' + latest : ''
        return axios.get(`/api/explorer/v1/blocks?count=${PER_PAGE}${suffix}`).then(response => response.data)
      },

      getBlock(height) {
        return axios.get(`/api/explorer/v1/block?height=${height}`).then(response => response.data)
      },

      getTransaction(hash) {
        return axios.get(`/api/explorer/v1/transactions?hash=${hash}`).then(response => response.data)
      }
    }
  }
}
