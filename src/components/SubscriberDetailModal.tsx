import React from 'react';
import { SubscriberDetailPage } from './SubscriberDetailPage';
import { Subscriber, PaymentRecord, MikroTikDhcpLease, MikroTikInterface, AuthUser } from '../types';

interface SubscriberDetailModalProps {
  subscriber: Subscriber | null;
  subscribers?: Subscriber[];
  payments: PaymentRecord[];
  dhcpLeases?: MikroTikDhcpLease[];
  mikrotikInterfaces?: MikroTikInterface[];
  currentUser?: AuthUser | null;
  onClose: () => void;
  onUpdateSubscriber: (updated: Subscriber) => void;
  onDeleteSubscriber: (subId: number) => void;
  onDeleteDhcpLease?: (leaseId: string, macAddress?: string) => Promise<boolean>;
  onAddPayment: (payment: PaymentRecord) => void;
  onDeletePayment: (ts: string, subId: number, month: string) => void;
  onOpenEditModal: (sub: Subscriber) => void;
}

/**
 * Backward compatibility wrapper for SubscriberDetailPage.
 * Note: Subscribers are now presented in full dedicated page views.
 */
export const SubscriberDetailModal: React.FC<SubscriberDetailModalProps> = ({
  subscriber,
  subscribers,
  payments,
  dhcpLeases,
  mikrotikInterfaces,
  currentUser,
  onClose,
  onUpdateSubscriber,
  onDeleteSubscriber,
  onDeleteDhcpLease,
  onAddPayment,
  onDeletePayment,
  onOpenEditModal,
}) => {
  return (
    <SubscriberDetailPage
      subscriber={subscriber}
      subscribers={subscribers}
      payments={payments}
      dhcpLeases={dhcpLeases}
      mikrotikInterfaces={mikrotikInterfaces}
      currentUser={currentUser}
      onBack={onClose}
      onUpdateSubscriber={onUpdateSubscriber}
      onDeleteSubscriber={onDeleteSubscriber}
      onDeleteDhcpLease={onDeleteDhcpLease}
      onAddPayment={onAddPayment}
      onDeletePayment={onDeletePayment}
      onOpenEditModal={onOpenEditModal}
    />
  );
};
