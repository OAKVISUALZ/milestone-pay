use soroban_sdk::{contracterror, contracttype, Address};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    InvalidState = 1,
    Unauthorized = 2,
    ZeroAmount = 3,
    InvalidParties = 4,
    NotFound = 5,
    AlreadyExists = 6,
    ArithmeticOverflow = 7,
    CannotCancelFunded = 8,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MilestoneStatus {
    Created = 0,
    Funded = 1,
    Released = 2,
    Refunded = 3,
    Cancelled = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Agreement {
    pub client: Address,
    pub freelancer: Address,
    pub token: Address,
    pub created_at: u64,
    pub milestone_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub agreement_id: u64,
    pub milestone_id: u32,
    pub amount: i128,
    pub status: MilestoneStatus,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    AgreementCount,
    Agreement(u64),
    Milestone(u64, u32),
}
