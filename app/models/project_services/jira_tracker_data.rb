# frozen_string_literal: true

class JiraTrackerData < ApplicationRecord
  belongs_to :service

  delegate :activated?, to: :service, allow_nil: true

  validates :service, presence: true

  def self.encryption_options
    {
      key: Settings.attr_encrypted_db_key_base_32,
      encode: true,
      mode: :per_attribute_iv,
      algorithm: 'aes-256-gcm'
    }
  end

  attr_encrypted :url, encryption_options
  attr_encrypted :api_url, encryption_options
  attr_encrypted :username, encryption_options
  attr_encrypted :password, encryption_options
end
