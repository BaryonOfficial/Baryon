'use client';

import { useForm } from '@formspree/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm as useHookForm } from 'react-hook-form';
import { z } from 'zod';
import { parsePhoneNumber, AsYouType } from 'libphonenumber-js';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';

const formSchema = z.object({
  name: z.string().min(2, { message: 'Name is required.' }),
  email: z.string().email({ message: 'Valid email is required.' }),
  phone: z
    .string()
    .optional()
    .refine(
      (value) => {
        if (!value) return true;
        try {
          const phoneNumber = parsePhoneNumber(value);
          return phoneNumber.isValid();
        } catch {
          return false;
        }
      },
      { message: 'Please enter a valid phone number with country code (e.g., +1 203 456 7890).' }
    ),
});

function SuccessCard() {
  return (
    <div className="dark w-full max-w-[350px]">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-semibold">Welcome to the Journey!</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-2">
            We're excited to have you on board.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm">
            We'll keep you updated on our launch and exciting developments.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function SignUpForm() {
  const [formspreeState, handleFormspreeSubmit] = useForm('xzzpprdb');
  const form = useHookForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
    },
  });

  const onSubmit = async (values) => {
    if (values.phone) {
      try {
        const phoneNumber = parsePhoneNumber(values.phone);
        values.phone = phoneNumber.format('INTERNATIONAL');
      } catch (error) {
        form.setError('phone', {
          type: 'manual',
          message: 'Please enter a valid phone number with country code.',
        });
        return;
      }
    }
    await handleFormspreeSubmit(values);
  };

  if (formspreeState.succeeded) {
    return <SuccessCard />;
  }

  return (
    // <div className="dark w-full">
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle>Get Notified on Launch</CardTitle>
        <CardDescription>Sign up for our plugin waitlist.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <Label htmlFor="name">Name</Label>
                  <FormControl>
                    <Input id="name" placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <Label htmlFor="phone">Phone Number (Optional)</Label>
                  <FormControl>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 203 456 7890"
                      {...field}
                      onChange={(e) => {
                        const formatter = new AsYouType();
                        const formattedValue = formatter.input(e.target.value);
                        field.onChange(formattedValue);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <Label htmlFor="email">Email</Label>
                  <FormControl>
                    <Input id="email" type="email" placeholder="johndoe@gmail.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          onClick={form.handleSubmit(onSubmit)}
          disabled={formspreeState.submitting}>
          Submit
        </Button>
      </CardFooter>
      <div className="px-6 pb-6">
        <p className="text-xs text-center">
          By submitting this form you agree to sign up to our plugin waitlist and receive marketing
          communications.
        </p>
      </div>
    </Card>
    // </div>
  );
}
