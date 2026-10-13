#![no_std]

mod events;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, token, Address, Env};
pub use types::{Agreement, ContractError, DataKey, Milestone, MilestoneStatus};

const PERSISTENT_BUMP_THRESHOLD: u32 = 50_000;
const PERSISTENT_EXTEND_TO: u32 = 100_000;

#[contract]
pub struct MilestoneEscrowContract;

#[contractimpl]
impl MilestoneEscrowContract {
    /// Create a new agreement with an immutable client, freelancer, and token.
    /// Milestone 1 is created with the specified amount in an unfunded state.
    pub fn create_agreement(
        env: Env,
        client: Address,
        freelancer: Address,
        token: Address,
        milestone_amount: i128,
    ) -> Result<u64, ContractError> {
        client.require_auth();

        if client == freelancer {
            return Err(ContractError::InvalidParties);
        }

        if milestone_amount <= 0 {
            return Err(ContractError::ZeroAmount);
        }

        let count_key = DataKey::AgreementCount;
        let mut count: u64 = env
            .storage()
            .persistent()
            .get(&count_key)
            .unwrap_or(0);

        count = count
            .checked_add(1)
            .ok_or(ContractError::ArithmeticOverflow)?;

        env.storage()
            .persistent()
            .set(&count_key, &count);

        env.storage()
            .persistent()
            .extend_ttl(&count_key, PERSISTENT_BUMP_THRESHOLD, PERSISTENT_EXTEND_TO);

        let agreement_id = count;
        let agreement = Agreement {
            client: client.clone(),
            freelancer: freelancer.clone(),
            token: token.clone(),
            created_at: env.ledger().timestamp(),
            milestone_count: 1,
        };

        let agreement_key = DataKey::Agreement(agreement_id);
        env.storage().persistent().set(&agreement_key, &agreement);
        env.storage().persistent().extend_ttl(
            &agreement_key,
            PERSISTENT_BUMP_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );

        let milestone = Milestone {
            agreement_id,
            milestone_id: 1,
            amount: milestone_amount,
            status: MilestoneStatus::Created,
        };

        let milestone_key = DataKey::Milestone(agreement_id, 1);
        env.storage().persistent().set(&milestone_key, &milestone);
        env.storage().persistent().extend_ttl(
            &milestone_key,
            PERSISTENT_BUMP_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );

        events::emit_agreement_created(
            &env,
            agreement_id,
            &client,
            &freelancer,
            &token,
            1,
        );

        Ok(agreement_id)
    }

    /// Client deposits milestone amount into escrow.
    pub fn fund_milestone(
        env: Env,
        agreement_id: u64,
        milestone_id: u32,
    ) -> Result<(), ContractError> {
        let agreement = Self::get_agreement(env.clone(), agreement_id)?;
        let mut milestone = Self::get_milestone(env.clone(), agreement_id, milestone_id)?;

        if milestone.status != MilestoneStatus::Created {
            return Err(ContractError::InvalidState);
        }

        agreement.client.require_auth();

        let token_client = token::Client::new(&env, &agreement.token);
        token_client.transfer(
            &agreement.client,
            &env.current_contract_address(),
            &milestone.amount,
        );

        milestone.status = MilestoneStatus::Funded;
        let milestone_key = DataKey::Milestone(agreement_id, milestone_id);
        env.storage().persistent().set(&milestone_key, &milestone);
        env.storage().persistent().extend_ttl(
            &milestone_key,
            PERSISTENT_BUMP_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );

        events::emit_milestone_funded(&env, agreement_id, milestone_id, milestone.amount);

        Ok(())
    }

    /// Client explicitly releases funds to the stored freelancer address.
    pub fn release_milestone(
        env: Env,
        agreement_id: u64,
        milestone_id: u32,
    ) -> Result<(), ContractError> {
        let agreement = Self::get_agreement(env.clone(), agreement_id)?;
        let mut milestone = Self::get_milestone(env.clone(), agreement_id, milestone_id)?;

        if milestone.status != MilestoneStatus::Funded {
            return Err(ContractError::InvalidState);
        }

        agreement.client.require_auth();

        milestone.status = MilestoneStatus::Released;
        let milestone_key = DataKey::Milestone(agreement_id, milestone_id);
        env.storage().persistent().set(&milestone_key, &milestone);
        env.storage().persistent().extend_ttl(
            &milestone_key,
            PERSISTENT_BUMP_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );

        let token_client = token::Client::new(&env, &agreement.token);
        token_client.transfer(
            &env.current_contract_address(),
            &agreement.freelancer,
            &milestone.amount,
        );

        events::emit_milestone_released(
            &env,
            agreement_id,
            milestone_id,
            &agreement.freelancer,
            milestone.amount,
        );

        Ok(())
    }

    /// Mutual refund: requires authorization from BOTH client and freelancer.
    /// Transfers funds back to the stored client address.
    pub fn refund_milestone(
        env: Env,
        agreement_id: u64,
        milestone_id: u32,
    ) -> Result<(), ContractError> {
        let agreement = Self::get_agreement(env.clone(), agreement_id)?;
        let mut milestone = Self::get_milestone(env.clone(), agreement_id, milestone_id)?;

        if milestone.status != MilestoneStatus::Funded {
            return Err(ContractError::InvalidState);
        }

        // Mutual authorization: BOTH parties must cryptographically sign
        agreement.client.require_auth();
        agreement.freelancer.require_auth();

        milestone.status = MilestoneStatus::Refunded;
        let milestone_key = DataKey::Milestone(agreement_id, milestone_id);
        env.storage().persistent().set(&milestone_key, &milestone);
        env.storage().persistent().extend_ttl(
            &milestone_key,
            PERSISTENT_BUMP_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );

        let token_client = token::Client::new(&env, &agreement.token);
        token_client.transfer(
            &env.current_contract_address(),
            &agreement.client,
            &milestone.amount,
        );

        events::emit_milestone_refunded(
            &env,
            agreement_id,
            milestone_id,
            &agreement.client,
            milestone.amount,
        );

        Ok(())
    }

    /// Client cancels an unfunded milestone.
    pub fn cancel_milestone(
        env: Env,
        agreement_id: u64,
        milestone_id: u32,
    ) -> Result<(), ContractError> {
        let agreement = Self::get_agreement(env.clone(), agreement_id)?;
        let mut milestone = Self::get_milestone(env.clone(), agreement_id, milestone_id)?;

        if milestone.status == MilestoneStatus::Funded {
            return Err(ContractError::CannotCancelFunded);
        }

        if milestone.status != MilestoneStatus::Created {
            return Err(ContractError::InvalidState);
        }

        agreement.client.require_auth();

        milestone.status = MilestoneStatus::Cancelled;
        let milestone_key = DataKey::Milestone(agreement_id, milestone_id);
        env.storage().persistent().set(&milestone_key, &milestone);
        env.storage().persistent().extend_ttl(
            &milestone_key,
            PERSISTENT_BUMP_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );

        events::emit_milestone_cancelled(&env, agreement_id, milestone_id);

        Ok(())
    }

    /// Read agreement state
    pub fn get_agreement(env: Env, agreement_id: u64) -> Result<Agreement, ContractError> {
        let agreement_key = DataKey::Agreement(agreement_id);
        let agreement = env
            .storage()
            .persistent()
            .get(&agreement_key)
            .ok_or(ContractError::NotFound)?;

        env.storage().persistent().extend_ttl(
            &agreement_key,
            PERSISTENT_BUMP_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );

        Ok(agreement)
    }

    /// Read milestone state
    pub fn get_milestone(
        env: Env,
        agreement_id: u64,
        milestone_id: u32,
    ) -> Result<Milestone, ContractError> {
        let milestone_key = DataKey::Milestone(agreement_id, milestone_id);
        let milestone = env
            .storage()
            .persistent()
            .get(&milestone_key)
            .ok_or(ContractError::NotFound)?;

        env.storage().persistent().extend_ttl(
            &milestone_key,
            PERSISTENT_BUMP_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );

        Ok(milestone)
    }

    /// Read total agreements count
    pub fn get_agreement_count(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::AgreementCount)
            .unwrap_or(0)
    }
}
