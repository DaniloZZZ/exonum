// Copyright 2019 The Exonum Team
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//! Cryptocurrency database schema.

use exonum::{
    crypto::{Hash, PublicKey},
    storage::{Fork, ProofListIndex, ProofMapIndex, Snapshot},
};
use std::cmp::Ordering;

use crate::{wallet::Wallet, multisig::{TxSign, TransferMultisig},INITIAL_BALANCE};

/// Database schema for the cryptocurrency.
#[derive(Debug)]
pub struct Schema<T> {
    view: T,
}

impl<T> AsMut<T> for Schema<T> {
    fn as_mut(&mut self) -> &mut T {
        &mut self.view
    }
}

impl<T> Schema<T>
where
    T: AsRef<dyn Snapshot>,
{
    /// Creates a new schema from the database view.
    pub fn new(view: T) -> Self {
        Schema { view }
    }

    /// Returns `ProofMapIndex` with wallets.
    pub fn wallets(&self) -> ProofMapIndex<&T, PublicKey, Wallet> {
        ProofMapIndex::new("cryptocurrency.wallets", &self.view)
    }

    /// Returns history of the wallet with the given public key.
    pub fn wallet_history(&self, public_key: &PublicKey) -> ProofListIndex<&T, Hash> {
        ProofListIndex::new_in_family("cryptocurrency.wallet_history", public_key, &self.view)
    }

    /// Returns wallet for the given public key.
    pub fn wallet(&self, pub_key: &PublicKey) -> Option<Wallet> {
        self.wallets().get(pub_key)
    }
    /// returns multisig txs

    /// Returns proof map index with  transaction tx signs
    pub fn txsigns(&self) -> ProofListIndex<&T, TxSign> {
        ProofListIndex::new("cryptocurrency.txsigns", &self.view)
    }

    /// Returns proof map index with  transaction tx signs
    pub fn multi_sigs_of_tx(&self, tx_hash:Hash) -> Vec<TxSign> {
        self.txsigns()
            .iter()
            .filter( |sign| sign.tx_hash == tx_hash )
            .collect()
    }

    /// Returns the state hash of cryptocurrency service.
    pub fn state_hash(&self) -> Vec<Hash> {
        vec![self.wallets().merkle_root()]
    }
}

/// Implementation of mutable methods.
impl<'a> Schema<&'a mut Fork> {
    /// Return multisig transactions
    pub fn multisigs_mut(&mut self) -> ProofMapIndex<&mut Fork, Hash, TransferMultisig> {
        ProofMapIndex::new("cryptocurrency.multisigs", &mut self.view)
    }
    /// Return a multisig tx
    pub fn get_multisig_mut(&mut self, hash: &Hash)->Option<TransferMultisig>{
        self.multisigs_mut().get(hash)
    }

    /// Return mutable list fo txsigns
    pub fn txsigns_mut(&mut self) -> ProofListIndex<&mut Fork, TxSign> {
        ProofListIndex::new("cryptocurrency.txsigns", &mut self.view)
    }
    /// Returns mutable `ProofMapIndex` with wallets.
    pub fn wallets_mut(&mut self) -> ProofMapIndex<&mut Fork, PublicKey, Wallet> {
        ProofMapIndex::new("cryptocurrency.wallets", &mut self.view)
    }

    /// Returns history for the wallet by the given public key.
    pub fn wallet_history_mut(
        &mut self,
        public_key: &PublicKey,
    ) -> ProofListIndex<&mut Fork, Hash> {
        ProofListIndex::new_in_family("cryptocurrency.wallet_history", public_key, &mut self.view)
    }

    /// Increase balance of the wallet and append new record to its history.
    ///
    /// Panics if there is no wallet with given public key.
    pub fn increase_wallet_balance(&mut self, wallet: Wallet, amount: u64, transaction: &Hash) {
        let wallet = {
            let mut history = self.wallet_history_mut(&wallet.pub_key);
            history.push(*transaction);
            let history_hash = history.merkle_root();
            let balance = wallet.balance;
            wallet.set_balance(balance + amount, &history_hash)
        };
        self.wallets_mut().put(&wallet.pub_key, wallet.clone());
    }

    /// Decrease balance of the wallet and append new record to its history.
    ///
    /// Panics if there is no wallet with given public key.
    pub fn decrease_wallet_balance(&mut self, wallet: Wallet, amount: u64, transaction: &Hash) {
        let wallet = {
            let mut history = self.wallet_history_mut(&wallet.pub_key);
            history.push(*transaction);
            let history_hash = history.merkle_root();
            let balance = wallet.balance;
            wallet.set_balance(balance - amount, &history_hash)
        };
        self.wallets_mut().put(&wallet.pub_key, wallet.clone());
    }

    /// Create new txsign
    pub fn create_txsign(&mut self, tx_hash: Hash, signer: PublicKey){
        let mut list = self.txsigns_mut();
        println!("txsingn before create len {}",list.len());
        list.push(TxSign{
                tx_hash,
                signer
            });
        println!("txsingn before create len {}",list.len());
    }


    /// Create new wallet and append first record to its history.
    pub fn create_wallet(&mut self, key: &PublicKey, name: &str, transaction: &Hash) {
        let wallet = {
            let mut history = self.wallet_history_mut(key);
            history.push(*transaction);
            let history_hash = history.merkle_root();
            Wallet::new(key, name, INITIAL_BALANCE, history.len(), &history_hash)
        };
        self.wallets_mut().put(key, wallet);
    }
    /*
    /// Returns mutable `ProofMapIndex` with txsigns
    pub fn txsigns_mut(&mut self) -> ProofMapIndex<&mut Fork, PublicKey, Wallet> {
        ProofMapIndex::new("cryptocurrency.txsigns", &mut self.view)
    }
    /// Create new sign of transaction
    pub fn create_txsign(&mut self, key: &PublicKey, name: &str, transaction: &Hash) {
        let txsign= {
            history.push(*transaction);
            let history_hash = history.merkle_root();
            Wallet::new(key, name, INITIAL_BALANCE, history.len(), &history_hash)
        };
        self.txsigns_mut().put(key, wallet);
    }
    */
}
