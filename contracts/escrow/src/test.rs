use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env,
};

fn setup_test_env<'a>() -> (
    Env,
    Address,
    MilestoneEscrowContractClient<'a>,
    Address,
    Address,
    Address,
    TokenClient<'a>,
    StellarAssetClient<'a>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MilestoneEscrowContract);
    let escrow_client = MilestoneEscrowContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_contract_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_id = token_contract_id.address();
    let token_client = TokenClient::new(&env, &token_id);
    let token_admin_client = StellarAssetClient::new(&env, &token_id);

    let client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    // Mint tokens to client
    token_admin_client.mint(&client, &1_000_000_000);

    (
        env,
        contract_id,
        escrow_client,
        client,
        freelancer,
        token_id,
        token_client,
        token_admin_client,
    )
}

#[test]
fn test_create_agreement_success() {
    let (_env, _, escrow_client, client, freelancer, token_id, _, _) = setup_test_env();

    let amount = 50_000_000i128; // 5 XLM
    let agreement_id = escrow_client.create_agreement(&client, &freelancer, &token_id, &amount);

    assert_eq!(agreement_id, 1);
    assert_eq!(escrow_client.get_agreement_count(), 1);

    let ag = escrow_client.get_agreement(&1);
    assert_eq!(ag.client, client);
    assert_eq!(ag.freelancer, freelancer);
    assert_eq!(ag.token, token_id);
    assert_eq!(ag.milestone_count, 1);

    let ms = escrow_client.get_milestone(&1, &1);
    assert_eq!(ms.agreement_id, 1);
    assert_eq!(ms.milestone_id, 1);
    assert_eq!(ms.amount, amount);
    assert_eq!(ms.status, MilestoneStatus::Created);
}

#[test]
fn test_create_agreement_invalid_parties() {
    let (_env, _, escrow_client, client, _, token_id, _, _) = setup_test_env();

    // Client cannot be freelancer
    let res = escrow_client.try_create_agreement(&client, &client, &token_id, &100);
    assert_eq!(res.err(), Some(Ok(ContractError::InvalidParties)));
}

#[test]
fn test_create_agreement_zero_or_negative_amount() {
    let (_env, _, escrow_client, client, freelancer, token_id, _, _) = setup_test_env();

    let res_zero = escrow_client.try_create_agreement(&client, &freelancer, &token_id, &0);
    assert_eq!(res_zero.err(), Some(Ok(ContractError::ZeroAmount)));

    let res_neg = escrow_client.try_create_agreement(&client, &freelancer, &token_id, &-50);
    assert_eq!(res_neg.err(), Some(Ok(ContractError::ZeroAmount)));
}

#[test]
fn test_complete_happy_path_fund_and_release() {
    let (_env, contract_id, escrow_client, client, freelancer, token_id, token_client, _) =
        setup_test_env();

    let amount = 200_000_000i128; // 20 XLM
    let initial_client_bal = token_client.balance(&client);
    assert_eq!(initial_client_bal, 1_000_000_000);

    let agreement_id = escrow_client.create_agreement(&client, &freelancer, &token_id, &amount);

    // 1. Fund milestone
    escrow_client.fund_milestone(&agreement_id, &1);

    // Escrow contract holds the funds, client balance decreased
    assert_eq!(token_client.balance(&contract_id), amount);
    assert_eq!(token_client.balance(&client), initial_client_bal - amount);

    let ms = escrow_client.get_milestone(&agreement_id, &1);
    assert_eq!(ms.status, MilestoneStatus::Funded);

    // 2. Release milestone
    escrow_client.release_milestone(&agreement_id, &1);

    // Contract has 0, freelancer received amount
    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(token_client.balance(&freelancer), amount);

    let ms_after = escrow_client.get_milestone(&agreement_id, &1);
    assert_eq!(ms_after.status, MilestoneStatus::Released);
}

#[test]
fn test_mutual_refund_happy_path() {
    let (_env, contract_id, escrow_client, client, freelancer, token_id, token_client, _) =
        setup_test_env();

    let amount = 150_000_000i128;
    let initial_client_bal = token_client.balance(&client);
    let agreement_id = escrow_client.create_agreement(&client, &freelancer, &token_id, &amount);

    escrow_client.fund_milestone(&agreement_id, &1);
    assert_eq!(token_client.balance(&contract_id), amount);

    // Both parties authorize refund
    escrow_client.refund_milestone(&agreement_id, &1);

    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(token_client.balance(&client), initial_client_bal);
    assert_eq!(token_client.balance(&freelancer), 0);

    let ms = escrow_client.get_milestone(&agreement_id, &1);
    assert_eq!(ms.status, MilestoneStatus::Refunded);
}

#[test]
fn test_double_release_rejected() {
    let (_, _, escrow_client, client, freelancer, token_id, _, _) = setup_test_env();

    let amount = 100_000_000i128;
    let agreement_id = escrow_client.create_agreement(&client, &freelancer, &token_id, &amount);
    escrow_client.fund_milestone(&agreement_id, &1);
    escrow_client.release_milestone(&agreement_id, &1);

    // Attempt second release
    let res = escrow_client.try_release_milestone(&agreement_id, &1);
    assert_eq!(res.err(), Some(Ok(ContractError::InvalidState)));
}

#[test]
fn test_double_refund_rejected() {
    let (_, _, escrow_client, client, freelancer, token_id, _, _) = setup_test_env();

    let amount = 100_000_000i128;
    let agreement_id = escrow_client.create_agreement(&client, &freelancer, &token_id, &amount);
    escrow_client.fund_milestone(&agreement_id, &1);
    escrow_client.refund_milestone(&agreement_id, &1);

    // Attempt second refund
    let res = escrow_client.try_refund_milestone(&agreement_id, &1);
    assert_eq!(res.err(), Some(Ok(ContractError::InvalidState)));
}

#[test]
fn test_release_unfunded_rejected() {
    let (_, _, escrow_client, client, freelancer, token_id, _, _) = setup_test_env();

    let agreement_id = escrow_client.create_agreement(&client, &freelancer, &token_id, &100);

    let res = escrow_client.try_release_milestone(&agreement_id, &1);
    assert_eq!(res.err(), Some(Ok(ContractError::InvalidState)));
}

#[test]
fn test_refund_unfunded_rejected() {
    let (_, _, escrow_client, client, freelancer, token_id, _, _) = setup_test_env();

    let agreement_id = escrow_client.create_agreement(&client, &freelancer, &token_id, &100);

    let res = escrow_client.try_refund_milestone(&agreement_id, &1);
    assert_eq!(res.err(), Some(Ok(ContractError::InvalidState)));
}

#[test]
fn test_cancel_unfunded_milestone() {
    let (_, _, escrow_client, client, freelancer, token_id, _, _) = setup_test_env();

    let agreement_id = escrow_client.create_agreement(&client, &freelancer, &token_id, &100);

    escrow_client.cancel_milestone(&agreement_id, &1);

    let ms = escrow_client.get_milestone(&agreement_id, &1);
    assert_eq!(ms.status, MilestoneStatus::Cancelled);

    // Funding cancelled milestone should fail
    let res = escrow_client.try_fund_milestone(&agreement_id, &1);
    assert_eq!(res.err(), Some(Ok(ContractError::InvalidState)));
}

#[test]
fn test_cannot_cancel_funded_milestone() {
    let (_, _, escrow_client, client, freelancer, token_id, _, _) = setup_test_env();

    let agreement_id = escrow_client.create_agreement(&client, &freelancer, &token_id, &100);
    escrow_client.fund_milestone(&agreement_id, &1);

    let res = escrow_client.try_cancel_milestone(&agreement_id, &1);
    assert_eq!(res.err(), Some(Ok(ContractError::CannotCancelFunded)));
}

#[test]
fn test_cross_agreement_isolation() {
    let (env, contract_id, escrow_client, client1, freelancer1, token_id, token_client, token_admin) =
        setup_test_env();

    let client2 = Address::generate(&env);
    let freelancer2 = Address::generate(&env);
    token_admin.mint(&client2, &500_000_000);

    let ag1 = escrow_client.create_agreement(&client1, &freelancer1, &token_id, &100_000_000);
    let ag2 = escrow_client.create_agreement(&client2, &freelancer2, &token_id, &250_000_000);

    assert_eq!(ag1, 1);
    assert_eq!(ag2, 2);
    assert_eq!(escrow_client.get_agreement_count(), 2);

    // Fund both
    escrow_client.fund_milestone(&ag1, &1);
    escrow_client.fund_milestone(&ag2, &1);

    assert_eq!(token_client.balance(&contract_id), 350_000_000);

    // Release ag1 only
    escrow_client.release_milestone(&ag1, &1);

    assert_eq!(token_client.balance(&freelancer1), 100_000_000);
    assert_eq!(token_client.balance(&freelancer2), 0);
    assert_eq!(token_client.balance(&contract_id), 250_000_000);

    // Statuses
    let ms1 = escrow_client.get_milestone(&ag1, &1);
    let ms2 = escrow_client.get_milestone(&ag2, &1);
    assert_eq!(ms1.status, MilestoneStatus::Released);
    assert_eq!(ms2.status, MilestoneStatus::Funded);

    // Refund ag2
    escrow_client.refund_milestone(&ag2, &1);
    assert_eq!(token_client.balance(&client2), 500_000_000);
    assert_eq!(token_client.balance(&contract_id), 0);
}

#[test]
#[should_panic]
fn test_unauthorized_call_without_signature_rejected() {
    let env = Env::default();
    // Do NOT call env.mock_all_auths() -> any unauthenticated call must fail host auth check
    let contract_id = env.register_contract(None, MilestoneEscrowContract);
    let escrow_client = MilestoneEscrowContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_contract_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_id = token_contract_id.address();

    let client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    // Must panic because client has not authorized create_agreement
    escrow_client.create_agreement(&client, &freelancer, &token_id, &100_000_000);
}

#[test]
fn test_mutual_refund_verifies_both_party_authorizations() {
    let (env, _, escrow_client, client, freelancer, token_id, _, _) = setup_test_env();

    let agreement_id =
        escrow_client.create_agreement(&client, &freelancer, &token_id, &100_000_000);
    escrow_client.fund_milestone(&agreement_id, &1);

    escrow_client.refund_milestone(&agreement_id, &1);

    // Inspect recorded host authorizations from the refund_milestone invocation
    let auths = env.auths();
    let has_client_auth = auths.iter().any(|(addr, _)| addr == &client);
    let has_freelancer_auth = auths.iter().any(|(addr, _)| addr == &freelancer);

    assert!(has_client_auth);
    assert!(has_freelancer_auth);
}

#[test]
fn test_storage_ttl_extension_across_ledger_advancement() {
    use soroban_sdk::testutils::{storage::Persistent as _, Ledger as _};

    let (env, contract_id, escrow_client, client, freelancer, token_id, _, _) = setup_test_env();

    let agreement_id =
        escrow_client.create_agreement(&client, &freelancer, &token_id, &100_000_000);
    escrow_client.fund_milestone(&agreement_id, &1);

    let ag_key = DataKey::Agreement(agreement_id);
    let ms_key = DataKey::Milestone(agreement_id, 1);

    // Ensure contract instance TTL is bumped to 100,000 ledgers so it remains live across 60k ledgers
    env.as_contract(&contract_id, || {
        env.storage().instance().extend_ttl(50_000, 100_000);
    });

    let initial_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&ms_key)
    });
    assert_eq!(initial_ttl, 100_000);

    // Advance ledger sequence by 60,000 ledgers (~3.5 days), dropping persistent TTL below bump threshold (50,000)
    env.ledger().with_mut(|li| {
        li.sequence_number += 60_000;
    });

    let decayed_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&ms_key)
    });
    assert_eq!(decayed_ttl, 40_000);

    // Calling get_agreement and get_milestone renews persistent TTL back to 100,000 ledgers
    let _ag = escrow_client.get_agreement(&agreement_id);
    let _ms = escrow_client.get_milestone(&agreement_id, &1);

    let renewed_ag_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&ag_key)
    });
    let renewed_ms_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&ms_key)
    });

    assert_eq!(renewed_ag_ttl, 100_000);
    assert_eq!(renewed_ms_ttl, 100_000);
}

