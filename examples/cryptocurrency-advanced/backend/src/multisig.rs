//! Cryptocurrency API.
//
// Brief summary of how exonum framework works
//
// main file: main.rs sets up services to be accessed
// from http. 
//
// main.rs
//  <- lib.rs
//  library that uses api that is defined in api.rs and 
//  uses walletTransactions Transaction set enum
//  Order in the enum defines id of transaction to be
//  used by frontend
//      <- transactions.rs
//          this file contains implementations of different
//          types of transactions. it uses methods 
//          defined in shema.rs to modify database

use exonum::{
    blockchain::{self, ExecutionError, ExecutionResult, Transaction, TransactionContext},
    crypto::{PublicKey, SecretKey, Hash},
    messages::{Message, RawTransaction, Signed},
};

use super::proto;
use crate::{schema::Schema, CRYPTOCURRENCY_SERVICE_ID,
transactions::Error};

/// Transfer `amount` of the currency from one wallet to another.
#[derive(Clone, Debug, ProtobufConvert)]
#[exonum(pb = "proto::TransferMultisig", serde_pb_convert)]
pub struct TransferMultisig {
    /// `PublicKey` of receiver's wallet.
    pub to: PublicKey,
    /// approvers
    pub approvers: Vec<PublicKey>,
    /// Amount of currency to transfer.
    pub amount: u64,
    /// Auxiliary number to guarantee [non-idempotence][idempotence] of transactions.
    ///
    /// [idempotence]: https://en.wikipedia.org/wiki/Idempotence
    pub seed: u64,
}

/// Sign of a multisig tx
#[derive(Serialize, Deserialize, Clone, Debug, ProtobufConvert)]
#[exonum(pb = "proto::TxSign")]
pub struct TxSign{
    /// Tx hash
    pub tx_hash:Hash,
    /// Signer public key
    pub signer:PublicKey,
}

impl Transaction for TransferMultisig {
    fn execute(&self, mut context: TransactionContext) -> ExecutionResult {

        let from = &context.author();
        let hash = context.tx_hash();
        let mut schema = Schema::new(context.fork());
        let to = &self.to;
        let amount = self.amount;
        println!("hasg of msig {}",hash);
        println!("to {}",to);
        println!("amoun {}",amount);

        let sender = schema.wallet(from).ok_or(Error::SenderNotFound)?;

        let receiver = schema.wallet(to).ok_or(Error::ReceiverNotFound)?;

        if sender.balance < amount {
            Err(Error::InsufficientCurrencyAmount)?
        }

        schema.decrease_wallet_balance(sender, amount, &hash);
        schema.increase_wallet_balance(receiver, amount, &hash);
        // Put the tx into db
        println!("putting to db");
        schema.multisigs_mut().put(&hash, self.clone());
        println!("putted to db");

        Ok(())
    }
}

impl Transaction for TxSign {
    fn execute(&self, mut context: TransactionContext) -> ExecutionResult {
        println!("excec with for hash {}",self.tx_hash);
        let signer = context.author();
        println!("excec from {}",signer);
        let fork  = context.fork();
        let mut schema = Schema::new(fork);
        let msig = schema.multisigs_mut().get(&self.tx_hash);
        println!("getting approvers");
        let approvers = msig.unwrap().approvers;
        println!("approvers: {}",approvers[0]);

        println!("create txsign");
        schema.create_txsign(self.tx_hash,signer);
        let signs = schema.multi_sigs_of_tx(self.tx_hash);

        Ok(())
    }
}

